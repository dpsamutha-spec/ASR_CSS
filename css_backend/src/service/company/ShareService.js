'use strict';

const httpStatus  = require('http-status');
const { v4: uuidv4 } = require('uuid');
const { Op }      = require('sequelize');

const { getCurrentModels }    = require('../../models');
const ShareDao                = require('../../dao/company/ShareDao');
const ShareTransactionDao     = require('../../dao/company/ShareTransactionDao');
const SharePaymentDao         = require('../../dao/company/SharePaymentDao');
const ShareLedgerDao          = require('../../dao/company/ShareLedgerDao');
const responseHandler         = require('../../helper/responseHandler');
const logger                  = require('../../config/logger');
const {
    buildSourceESContext,
    buildESSnapshotForOldData,
    createEntityShareEntry,
    reduceEntityShares,
    deleteEntityShares,
    restoreEntitySharesSnapshot,
} = require('../../helper/entitySharesHelper');
const {
    resolveCombineContext,
    buildCombinePostUpdates,
} = require('../../helper/combineHelper');

// cs_officials.official_type → cs_share_transactions.official_type ENUM mapping
const OFFICIAL_TYPE_TXN = { COMPANY: 'CORPORATE', SUB_FUND: 'SUBFUND' };
const mapOfficialType = (t) => OFFICIAL_TYPE_TXN[t] || t || 'INDIVIDUAL';

// Map frontend TX_TYPE string → transaction_type t_slug
const TX_TYPE_SLUG = {
    ALLOTMENT:    'allotment',
    TRANSFER:     'transfer',
    TRANSMISSION: 'transfer',
    CONVERSION:   'conversion',
    REDEMPTION:   'redemption',
    BUYBACK:      'buyback',
    BONUS:        'allotment',
    OPENING:      'pre-allotment',
};

class ShareService {

    constructor() {
        this.shareDao      = new ShareDao();
        this.txnDao        = new ShareTransactionDao();
        this.paymentDao    = new SharePaymentDao();
        this.ledgerDao     = new ShareLedgerDao();
    }

    // ── Shared includes for list/get ─────────────────────────────────────────

    _txnIncludes(models) {
        const inc = [];
        if (models.entities) {
            inc.push({ model: models.entities, as: 'official_entity',   required: false, attributes: ['entity_id', 'name', 'client_no'] });
            inc.push({ model: models.entities, as: 'transferee_entity', required: false, attributes: ['entity_id', 'name', 'client_no'] });
            inc.push({ model: models.entities, as: 'transferor_entity', required: false, attributes: ['entity_id', 'name', 'client_no'] });
        }
        if (models.share_class_master) {
            inc.push({ model: models.share_class_master, as: 'share_class', required: false,
                attributes: ['sc_id', 'sc_name', 'sc_slug'] });
        }
        if (models.shares) {
            const shareInc = [];
            if (models.transaction_type) {
                shareInc.push({ model: models.transaction_type, as: 'transaction_type', required: false,
                    attributes: ['t_id', 't_name', 't_type_color'] });
            }
            inc.push({ model: models.shares, as: 'share_header', required: false,
                attributes: ['share_id', 'transaction_date', 'extra_type_of_transaction', 'status'],
                include: shareInc });
        }
        return inc;
    }

    // ── CREATE ALLOTMENT ─────────────────────────────────────────────────────

    createAllotment = async (body, userId) => {
        try {
            const models = getCurrentModels();

            const {
                entity_id,
                company_share_id,
                official_id,
                tx_type       = 'ALLOTMENT',
                type_of_shares,
                merge_share,
                tx_date,
                folio_no,
                cert_no,
                allotment_no,
                tx_status     = 'DRAFT',
                is_ubo        = false,
                lines         = [],
                has_instalment = 'NO',
                payment_date,
                distinctive_from,
                distinctive_to,
                remarks,
            } = body;

            // Validate required
            if (!entity_id)       return responseHandler.returnError(httpStatus.BAD_REQUEST, 'entity_id is required');
            if (!company_share_id) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'company_share_id is required');
            if (!official_id)     return responseHandler.returnError(httpStatus.BAD_REQUEST, 'official_id is required');
            if (!tx_date)         return responseHandler.returnError(httpStatus.BAD_REQUEST, 'tx_date is required');
            if (!lines.length)    return responseHandler.returnError(httpStatus.BAD_REQUEST, 'At least one share line is required');

            // Look up official → get official_entity_id and official_type
            const official = await models.officials?.findOne({
                where: { official_id, is_deleted: 0 },
                attributes: ['official_id', 'official_entity_id', 'official_type'],
            });
            if (!official) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Shareholder not found');

            const official_entity_id = official.official_entity_id;
            const official_type      = mapOfficialType(official.official_type);

            // Look up company share for currency/class/type info
            const companyShare = await models.entity_shares?.findOne({
                where: { id: company_share_id, is_deleted: 0 },
            });
            if (!companyShare) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Company share not found');

            // Resolve transaction_type_id from slug
            const slug    = TX_TYPE_SLUG[tx_type] || 'allotment';
            const txType  = await models.transaction_type?.findOne({ where: { t_slug: slug } });
            const tx_type_id = txType?.t_id || 2; // fallback: 2 = allotment

            // Validate balance
            // Count IN + NONE rows that are VALID — same logic as EntityShareService.allotted_shares
            const existingAllotted = await this.txnDao.Model.sum('no_of_shares', {
                where: { company_share_id, entity_id, transaction_status: { [Op.in]: ['IN', 'NONE'] }, status: 'VALID', is_deleted: 0 },
            }) || 0;
            const totalNewQty = lines.reduce((s, l) => s + (Number(l.no_of_shares) || 0), 0);
            const balanceShares = Number(companyShare.number_of_shares || 0) - Number(existingAllotted);

            if (totalNewQty > balanceShares) {
                return responseHandler.returnError(httpStatus.BAD_REQUEST,
                    `Total shares (${totalNewQty}) exceeds available balance (${balanceShares})`);
            }

            // Generate one share_set_id for the whole allotment
            const share_set_id = uuidv4();

            // Create cs_shares header
            const shareHeader = await this.shareDao.create({
                entity_id,
                transaction_type_id:       tx_type_id,
                extra_type_of_transaction: tx_type,
                transaction_date:          tx_date,
                status:                    tx_status === 'ACTIVE' ? 'VALID' : 'DRAFT',
                source_from:               'MANUAL',
                remarks:                   remarks || null,
                is_deleted:                0,
                share_set_id,
                created_by: userId || null,
                updated_by: userId || null,
            });

            // Build transaction rows (one per line)
            const txnRows = lines
                .filter(l => Number(l.no_of_shares) > 0)
                .map(l => {
                    const qty     = Number(l.no_of_shares);
                    const perSh   = Number(companyShare.per_share || 0);
                    const issued  = qty * perSh;
                    const noConsid = l.no_consideration ? 1 : 0;
                    const cash     = noConsid ? null : (Number(l.cash) || null);
                    const oc       = noConsid ? null : (Number(l.otherwise_cash) || null);
                    const coc      = noConsid ? 0 : ((Number(l.cash) || 0) + (Number(l.otherwise_cash) || 0));

                    return {
                        share_id:             shareHeader.share_id,
                        share_set_id,
                        company_share_id,
                        entity_id,
                        official_type,
                        official_entity_id,
                        currency:             companyShare.currency,
                        share_class_id:       companyShare.share_class_id,
                        share_type:           companyShare.share_type || 'NORMAL',
                        transaction_status:   'IN',
                        transaction_no:       allotment_no || null,
                        folio_no:             folio_no     || null,
                        share_cert_no:        cert_no      || null,
                        no_of_shares:         qty,
                        issued_share_capital: issued,
                        paidup_share_capital: issued,
                        unpaid_share_capital: Math.max(0, issued - coc),
                        per_share:            perSh,
                        issued_per_share:     perSh,
                        cash,
                        otherwise_cash:       oc,
                        no_consideration:     noConsid,
                        transactional_consideration: noConsid ? null : coc,
                        is_ubo:               is_ubo ? 1 : 0,
                        is_partially_paid:    has_instalment === 'YES' ? 1 : 0,
                        data_from:            'MANUAL',
                        status:               tx_status === 'ACTIVE' ? 'VALID' : 'DRAFT',
                        is_deleted:           0,
                        created_by:           userId || null,
                        updated_by:           userId || null,
                    };
                });

            // Query existing shareholder balance BEFORE inserting new rows
            const prevQty    = Number(await this.txnDao.Model.sum('no_of_shares',        { where: { company_share_id, official_entity_id, transaction_status: 'IN', is_deleted: 0 } })) || 0;
            const prevIssued = Number(await this.txnDao.Model.sum('issued_share_capital', { where: { company_share_id, official_entity_id, transaction_status: 'IN', is_deleted: 0 } })) || 0;
            const prevPaidup = Number(await this.txnDao.Model.sum('paidup_share_capital', { where: { company_share_id, official_entity_id, transaction_status: 'IN', is_deleted: 0 } })) || 0;

            const created = await this.txnDao.bulkCreate(txnRows, { returning: true });

            // ── cs_share_payments ────────────────────────────────────────────
            const paymentRows = [];
            created.forEach((txn, idx) => {
                const l   = lines.filter(x => Number(x.no_of_shares) > 0)[idx];
                if (!l) return;
                const noConsid  = Boolean(l.no_consideration);
                const cashAmt   = Number(l.cash          || 0);
                const ocAmt     = Number(l.otherwise_cash || 0);

                if (noConsid) {
                    paymentRows.push({
                        entity_id,
                        share_transaction_id:      txn.share_transaction_id,
                        share_set_id,
                        payment_type:              'NO_CONSIDERATION',
                        cash:                      null,
                        otherwise_cash:            null,
                        no_consideration:          1,
                        consideration_description: l.no_consideration,
                        payment_date:              payment_date || null,
                        is_deleted:                0,
                        created_by:                userId || null,
                        updated_by:                userId || null,
                    });
                } else {
                    if (cashAmt > 0) {
                        paymentRows.push({
                            entity_id,
                            share_transaction_id:      txn.share_transaction_id,
                            share_set_id,
                            payment_type:              'CASH',
                            cash:                      cashAmt,
                            otherwise_cash:            null,
                            no_consideration:          0,
                            consideration_description: null,
                            payment_date:              payment_date || null,
                            is_deleted:                0,
                            created_by:                userId || null,
                            updated_by:                userId || null,
                        });
                    }
                    if (ocAmt > 0) {
                        paymentRows.push({
                            entity_id,
                            share_transaction_id:      txn.share_transaction_id,
                            share_set_id,
                            payment_type:              'OTHERWISE_THAN_CASH',
                            cash:                      null,
                            otherwise_cash:            ocAmt,
                            no_consideration:          0,
                            consideration_description: null,
                            payment_date:              payment_date || null,
                            is_deleted:                0,
                            created_by:                userId || null,
                            updated_by:                userId || null,
                        });
                    }
                }
            });
            if (paymentRows.length) await this.paymentDao.bulkCreate(paymentRows);

            // ── cs_share_ledger ──────────────────────────────────────────────
            const ledgerRows = [];
            let runQty    = prevQty;
            let runIssued = prevIssued;
            let runPaidup = prevPaidup;

            created.forEach((txn, idx) => {
                const l = lines.filter(x => Number(x.no_of_shares) > 0)[idx];
                if (!l) return;
                const qty    = Number(l.no_of_shares);
                const perSh  = Number(companyShare.per_share || 0);
                const issued = qty * perSh;
                const paidup = issued;
                const noConsid = l.no_consideration ? 1 : 0;
                const cashAmt  = noConsid ? 0 : Number(l.cash           || 0);
                const ocAmt    = noConsid ? 0 : Number(l.otherwise_cash || 0);

                ledgerRows.push({
                    entity_id,
                    share_id:             shareHeader.share_id,
                    share_transaction_id: txn.share_transaction_id,
                    company_share_id,
                    share_set_id,
                    ledger_scope:         'SHAREHOLDER',
                    official_type,
                    official_entity_id,
                    transaction_type_id:  tx_type_id,
                    transaction_status:   'IN',
                    action_type:          'ADD',
                    transaction_date:     tx_date,
                    transaction_no:       allotment_no || null,
                    posting_order:        idx + 1,
                    currency:             companyShare.currency,
                    share_class_id:       companyShare.share_class_id,
                    share_type:           companyShare.share_type || 'NORMAL',
                    folio_no:             folio_no  || null,
                    share_cert_no:        cert_no   || null,

                    qty_in:               qty,
                    qty_out:              0,
                    issued_capital_in:    issued,
                    issued_capital_out:   0,
                    paidup_capital_in:    paidup,
                    paidup_capital_out:   0,
                    unpaid_capital_in:    Math.max(0, issued - (cashAmt + ocAmt)),
                    unpaid_capital_out:   0,
                    guarantee_amount_in:  0,
                    guarantee_amount_out: 0,

                    balance_before_qty:            runQty,
                    balance_after_qty:             runQty    + qty,
                    balance_before_issued_capital: runIssued,
                    balance_after_issued_capital:  runIssued + issued,
                    balance_before_paidup_capital: runPaidup,
                    balance_after_paidup_capital:  runPaidup + paidup,
                    balance_before_unpaid_capital: 0,
                    balance_after_unpaid_capital:  0,

                    consideration_cash:           cashAmt  || null,
                    consideration_otherwise_cash: ocAmt    || null,
                    no_consideration:             noConsid,
                    transactional_consideration:  noConsid ? null : (cashAmt + ocAmt) || null,

                    status:      tx_status === 'ACTIVE' ? 'VALID' : 'DRAFT',
                    source_from: 'MANUAL',
                    remarks:     remarks || null,
                    is_deleted:  0,
                    created_by:  userId || null,
                    updated_by:  userId || null,
                });

                runQty    += qty;
                runIssued += issued;
                runPaidup += paidup;
            });
            if (ledgerRows.length) await this.ledgerDao.bulkCreate(ledgerRows);

            // ── cs_share_distinctive ─────────────────────────────────────────
            if ((distinctive_from || distinctive_to) && created.length && models.share_distinctive) {
                const distinctiveRows = created.map((txn, idx) => {
                    const l = lines.filter(x => Number(x.no_of_shares) > 0)[idx];
                    return {
                        entity_id,
                        share_transaction_id: txn.share_transaction_id,
                        share_set_id,
                        share_cert_no:    cert_no           || null,
                        distinctive_from: distinctive_from  || null,
                        distinctive_to:   distinctive_to    || null,
                        no_of_shares:     l ? Number(l.no_of_shares) : 0,
                        is_deleted:       0,
                        created_by:       userId || null,
                        updated_by:       userId || null,
                    };
                });
                await models.share_distinctive.bulkCreate(distinctiveRows);
            }

            return responseHandler.returnSuccess(httpStatus.CREATED, 'Allotment saved successfully', {
                share_id:     shareHeader.share_id,
                share_set_id,
                transactions: created.map(t => t.share_transaction_id),
            });

        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── CREATE TRANSFER ──────────────────────────────────────────────────────

    createTransfer = async (body, userId) => {
        try {
            const models = getCurrentModels();
            const {
                entity_id,
                source_txn_id,
                transferee_official_id,
                transfer_qty,
                transfer_date,
                transfer_no,
                transferee_folio_no,
                transferee_cert_no,
                transferor_cert_no,
                // Transferee consideration
                transferee_cash, transferee_oc, transferee_no_consideration,
                // Transferor balance consideration
                transferor_cash, transferor_oc,
                is_ubo = false,
                // Instalment
                transferee_has_instalment,
                transferee_instalment_date,
                transferor_has_instalment,
                transferor_instalment_date,
                // Stamp duty — transferee (IN row)
                transferee_stamp_duty,
                transferee_stamp_duty_date,
                transferee_stamp_duty_amount,
                // Stamp duty — transferor (OUT row)
                transferor_stamp_duty,
                transferor_stamp_duty_date,
                transferor_stamp_duty_amount,
                // Remarks
                transferee_remarks,
                transferor_remarks,
                // Combine Holdings
                transferor_combine,
                transferor_combine_txn_id,
                transferee_combine,
                transferee_combine_txn_id,
            } = body;

            if (!entity_id)              return responseHandler.returnError(httpStatus.BAD_REQUEST, 'entity_id is required');
            if (!source_txn_id)          return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source transaction is required');
            if (!transferee_official_id) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Transferee shareholder is required');
            if (!transfer_qty || Number(transfer_qty) <= 0) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Transfer quantity must be greater than 0');
            if (!transfer_date)          return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Transfer date is required');

            // Load source transaction
            const sourceTxn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: source_txn_id, is_deleted: 0, transaction_status: 'IN' },
            });
            if (!sourceTxn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Source transaction not found');

            const qty = Number(transfer_qty);
            if (qty > Number(sourceTxn.no_of_shares)) {
                return responseHandler.returnError(httpStatus.BAD_REQUEST,
                    `Transfer quantity (${qty}) exceeds available shares (${sourceTxn.no_of_shares})`);
            }

            // Load transferee official
            const transfereeOfficial = await models.officials?.findOne({
                where: { official_id: transferee_official_id, is_deleted: 0 },
                attributes: ['official_id', 'official_entity_id', 'official_type'],
            });
            if (!transfereeOfficial) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transferee not found');

            const transferee_entity_id = transfereeOfficial.official_entity_id;
            if (String(transferee_entity_id) === String(sourceTxn.official_entity_id)) {
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Transferee cannot be the same as the transferor');
            }
            const transferee_type = mapOfficialType(transfereeOfficial.official_type);

            // Resolve TRANSFER transaction_type
            const txType     = await models.transaction_type?.findOne({ where: { t_slug: 'transfer' } });
            const tx_type_id = txType?.t_id || 3;

            const share_set_id = uuidv4();
            const perSh        = Number(sourceTxn.per_share || 0);
            const issued       = qty * perSh;

            // ── Combine flags + DB look-ups (via shared helper) ───────────────────
            const combineCtx = await resolveCombineContext({
                txnModel:                  this.txnDao.Model,
                source_txn_id,
                sourceTxn,
                perSh,
                transferee_entity_id,
                transferor_combine,
                transferor_combine_txn_id,
                transferee_combine,
                transferee_combine_txn_id,
            });
            const {
                isTorCombine, isTeeCombine, isTorCombineBase, isTorCombineSec,
                combineOutRow, teeCombineTxn, existingCombinedInRow,
                teeFirstCombine, teeSubsCombine,
            } = combineCtx;

            // Combined IN qty: first combine absorbs the existing holding into the new cert
            const combinedInQty    = teeFirstCombine ? qty + Number(teeCombineTxn.no_of_shares) : qty;
            const combinedInIssued = combinedInQty * perSh;

            // Transferee consideration
            const tcNoConsid = transferee_no_consideration ? 1 : 0;
            const tcCash     = tcNoConsid ? 0 : Number(transferee_cash || 0) + (teeFirstCombine ? Number(teeCombineTxn.cash || 0) : 0);
            const tcOC       = tcNoConsid ? 0 : Number(transferee_oc   || 0) + (teeFirstCombine ? Number(teeCombineTxn.otherwise_cash || 0) : 0);
            const tcTotal    = tcCash + tcOC;

            // Transferor balance consideration
            const torCash  = Number(transferor_cash || 0);
            const torOC    = Number(transferor_oc   || 0);
            const torTotal = torCash + torOC;

            // Balance shares for transferor
            const balanceQty    = Number(sourceTxn.no_of_shares) - qty;
            const balanceIssued = balanceQty * perSh;

            // Create share header
            const shareHeader = await this.shareDao.create({
                entity_id,
                transaction_type_id:       tx_type_id,
                extra_type_of_transaction: 'TRANSFER',
                transaction_date:          transfer_date,
                status:                    'VALID',
                source_from:               'MANUAL',
                share_set_id,
                remarks:    transferor_remarks || transferee_remarks || null,
                created_by: userId || null,
                updated_by: userId || null,
            });

            const commonFields = {
                share_id:           shareHeader.share_id,
                share_set_id,
                company_share_id:   sourceTxn.company_share_id,
                entity_id,
                currency:           sourceTxn.currency,
                share_class_id:     sourceTxn.share_class_id,
                share_type:         sourceTxn.share_type,
                transaction_no:     transfer_no || null,
                per_share:          perSh,
                issued_per_share:   perSh,
                old_share_id:       Number(source_txn_id),
                old_share_class_id: sourceTxn.share_class_id  || null,
                old_currency:       sourceTxn.currency         || null,
                old_share_cert_no:  sourceTxn.share_cert_no   || null,
                data_from:          'MANUAL',
                status:             'VALID',
                is_confirm:         1,
                is_deleted:         0,
                created_by:         userId || null,
                updated_by:         userId || null,
                is_partially_paid:  transferee_has_instalment === 'YES' ? 1 : 0,
            };

            // OUT row — transferor's balance after giving away qty shares
            // no_of_shares = REMAINING balance (not the transferred qty)
            // transaction_status = NONE (retaining balance), is_retain = 1
            const outRow = {
                ...commonFields,
                official_type:               sourceTxn.official_type,
                official_entity_id:          sourceTxn.official_entity_id,
                transaction_status:          'NONE',
                folio_no:                    sourceTxn.folio_no || null,
                // Combine base: lock to original source cert; ignore user-typed cert for the combined OUT row
                share_cert_no:               isTorCombineBase ? (sourceTxn.share_cert_no || null) : (transferor_cert_no || sourceTxn.share_cert_no || null),
                no_of_shares:                balanceQty,
                issued_share_capital:        balanceIssued,
                paidup_share_capital:        balanceIssued,
                cash:                        torCash || null,
                otherwise_cash:              torOC   || null,
                no_consideration:            0,
                transactional_consideration: torTotal || null,
                // transferee cols: who received qty shares and how many
                transferee_official_entity_id: transferee_entity_id,
                transferee_no_of_shares:     qty,
                transferee_issued_capital:   issued,
                transferee_paidup_capital:   issued,
                is_retain:                   balanceQty > 0 ? 1 : 0,
                is_ubo:                      sourceTxn.is_ubo || 0,
                is_partially_paid:           transferor_has_instalment === 'YES' ? 1 : 0,
                stamp_duty_payment:          transferor_stamp_duty ? 1 : 0,
                stamp_duty_payment_date:     transferor_stamp_duty ? (transferor_stamp_duty_date || null) : null,
                stamp_duty_payment_amount:   transferor_stamp_duty ? (transferor_stamp_duty_amount || null) : null,
                // Mark combine base so secondary transfers can locate this row
                combine_share_id:            isTorCombineBase ? Number(transferor_combine_txn_id) : null,
            };

            // IN row — transferee receives qty shares
            // transferor cols: who gave qty shares and how many (the qty transferred, not the balance)
            const inRow = {
                ...commonFields,
                official_type:               transferee_type,
                official_entity_id:          transferee_entity_id,
                transaction_status:          'IN',
                folio_no:                    transferee_folio_no || null,
                share_cert_no:               teeFirstCombine ? (teeCombineTxn.share_cert_no || null) : (transferee_cert_no || null),
                // First combine: absorb existing holding into new IN row
                no_of_shares:                combinedInQty,
                issued_share_capital:        combinedInIssued,
                paidup_share_capital:        combinedInIssued,
                cash:                        tcCash   || null,
                otherwise_cash:              tcOC     || null,
                no_consideration:            tcNoConsid,
                transactional_consideration: tcNoConsid ? null : (tcTotal || null),
                // transferor cols: who gave the shares and how many (the transferred qty)
                transferor_official_entity_id: sourceTxn.official_entity_id,
                transferor_no_of_shares:     qty,
                transferor_issued_capital:   issued,
                transferor_paidup_capital:   issued,
                is_ubo:                      is_ubo ? 1 : 0,
                is_partially_paid:           transferee_has_instalment === 'YES' ? 1 : 0,
                stamp_duty_payment:          transferee_stamp_duty ? 1 : 0,
                stamp_duty_payment_date:     transferee_stamp_duty ? (transferee_stamp_duty_date || null) : null,
                stamp_duty_payment_amount:   transferee_stamp_duty ? (transferee_stamp_duty_amount || null) : null,
                // Link to combined-from holding so subsequent transfers can locate this row
                combine_share_id:            teeFirstCombine ? Number(transferee_combine_txn_id) : null,
            };

            // Combine secondary: skip creating a new OUT row; reuse the combine-base OUT row
            let outTxn, inTxn;
            if (isTorCombineSec && combineOutRow) {
                outTxn = combineOutRow;
            } else {
                outTxn = await this.txnDao.create(outRow);
            }
            // Subsequent transferee combine: skip creating a new IN row; update the existing combined row
            if (teeSubsCombine) {
                inTxn = existingCombinedInRow;
            } else {
                inTxn = await this.txnDao.create(inRow);
            }

            // Build post-creation updates
            const postUpdates = [
                // Always invalidate the source transaction
                this.txnDao.Model.update({ status: 'INVALID' }, { where: { share_transaction_id: source_txn_id } }),
            ];

            // Cross-link only for freshly created rows (not reused combine rows)
            if (!(isTorCombineSec && combineOutRow)) {
                postUpdates.push(
                    this.txnDao.Model.update({ transferee_share_transaction_id: inTxn.share_transaction_id }, { where: { share_transaction_id: outTxn.share_transaction_id } }),
                );
            }
            if (!teeSubsCombine) {
                postUpdates.push(
                    this.txnDao.Model.update({ transferor_share_transaction_id: outTxn.share_transaction_id }, { where: { share_transaction_id: inTxn.share_transaction_id } }),
                );
            }

            // Combine post-updates (accumulate balance into combine-base OUT, invalidate
            // absorbed holding, accumulate into existing combined IN row)
            postUpdates.push(...buildCombinePostUpdates({
                txnModel:                  this.txnDao.Model,
                ctx:                       combineCtx,
                balanceQty,
                balanceIssued,
                torCash,
                torOC,
                transferee_combine_txn_id,
                qty,
                issued,
                tcCash,
                tcOC,
            }));

            await Promise.all(postUpdates);

            // ── cs_share_payments ────────────────────────────────────────────
            const paymentRows = [];

            // 1. Transferee IN row — consideration paid to acquire the transferred shares
            const payBase = {
                entity_id,
                share_transaction_id: inTxn.share_transaction_id,
                share_set_id,
                payment_date: transfer_date,
                is_deleted:   0,
                created_by:   userId || null,
                updated_by:   userId || null,
            };
            if (tcNoConsid) {
                paymentRows.push({ ...payBase, payment_type: 'NO_CONSIDERATION', cash: null, otherwise_cash: null, no_consideration: 1 });
            } else {
                if (tcCash > 0) paymentRows.push({ ...payBase, payment_type: 'CASH',                cash: tcCash, otherwise_cash: null, no_consideration: 0 });
                if (tcOC  > 0) paymentRows.push({ ...payBase, payment_type: 'OTHERWISE_THAN_CASH', cash: null,   otherwise_cash: tcOC,  no_consideration: 0 });
            }

            // 2. Transferor NONE row — pro-rated portion of their original payment for the retained balance.
            //    The source IN row becomes INVALID so its payment is orphaned; we re-attach the
            //    proportional amount to the NONE row so the balance shares still have a payment record.
            if (balanceQty > 0) {
                const sourcePayments = await this.paymentDao.Model.findAll({
                    where: { share_transaction_id: source_txn_id, is_deleted: 0 },
                    raw: true,
                });
                const proportion = Number(sourceTxn.no_of_shares) > 0
                    ? balanceQty / Number(sourceTxn.no_of_shares)
                    : 0;
                const nonePayBase = {
                    entity_id,
                    share_transaction_id: outTxn.share_transaction_id,
                    share_set_id,
                    payment_date: transfer_date,
                    is_deleted:   0,
                    created_by:   userId || null,
                    updated_by:   userId || null,
                };
                sourcePayments.forEach(p => {
                    paymentRows.push({
                        ...nonePayBase,
                        payment_type:              p.payment_type,
                        cash:                      p.cash             != null ? parseFloat((Number(p.cash)             * proportion).toFixed(6)) : null,
                        otherwise_cash:            p.otherwise_cash   != null ? parseFloat((Number(p.otherwise_cash)   * proportion).toFixed(6)) : null,
                        no_consideration:          p.no_consideration || 0,
                        consideration_description: p.consideration_description || null,
                    });
                });
            }

            if (paymentRows.length) await this.paymentDao.bulkCreate(paymentRows);

            // ── cs_share_ledger (2 rows: transferor REMOVE + transferee ADD) ──
            // Query transferee's running balance BEFORE this transfer
            const prevTeeQty    = Number(await this.txnDao.Model.sum('no_of_shares',         { where: { company_share_id: sourceTxn.company_share_id, official_entity_id: transferee_entity_id, transaction_status: 'IN', status: 'VALID', is_deleted: 0 } })) || 0;
            const prevTeeIssued = Number(await this.txnDao.Model.sum('issued_share_capital',  { where: { company_share_id: sourceTxn.company_share_id, official_entity_id: transferee_entity_id, transaction_status: 'IN', status: 'VALID', is_deleted: 0 } })) || 0;
            const prevTeePaidup = Number(await this.txnDao.Model.sum('paidup_share_capital',  { where: { company_share_id: sourceTxn.company_share_id, official_entity_id: transferee_entity_id, transaction_status: 'IN', status: 'VALID', is_deleted: 0 } })) || 0;

            const ledgerCommon = {
                entity_id,
                share_id:            shareHeader.share_id,
                company_share_id:    sourceTxn.company_share_id,
                share_set_id,
                transaction_type_id: tx_type_id,
                transaction_date:    transfer_date,
                transaction_no:      transfer_no || null,
                currency:            sourceTxn.currency,
                share_class_id:      sourceTxn.share_class_id,
                share_type:          sourceTxn.share_type || 'NORMAL',
                status:              'VALID',
                source_from:         'MANUAL',
                is_deleted:          0,
                created_by:          userId || null,
                updated_by:          userId || null,
            };

            await this.ledgerDao.bulkCreate([
                // Transferor — removing qty shares from their holding
                {
                    ...ledgerCommon,
                    share_transaction_id:  outTxn.share_transaction_id,
                    ledger_scope:          'SHAREHOLDER',
                    official_type:         sourceTxn.official_type,
                    official_entity_id:    sourceTxn.official_entity_id,
                    transaction_status:    'NONE',
                    action_type:           'REMOVE',
                    posting_order:         1,
                    folio_no:              sourceTxn.folio_no || null,
                    share_cert_no:         transferor_cert_no || sourceTxn.share_cert_no || null,
                    old_share_cert_no:     sourceTxn.share_cert_no || null,
                    qty_in:                0,
                    qty_out:               qty,
                    issued_capital_in:     0,
                    issued_capital_out:    issued,
                    paidup_capital_in:     0,
                    paidup_capital_out:    issued,
                    unpaid_capital_in:     0,
                    unpaid_capital_out:    0,
                    guarantee_amount_in:   0,
                    guarantee_amount_out:  0,
                    balance_before_qty:            Number(sourceTxn.no_of_shares),
                    balance_after_qty:             balanceQty,
                    balance_before_issued_capital: Number(sourceTxn.issued_share_capital),
                    balance_after_issued_capital:  balanceIssued,
                    balance_before_paidup_capital: Number(sourceTxn.paidup_share_capital),
                    balance_after_paidup_capital:  balanceIssued,
                    balance_before_unpaid_capital: 0,
                    balance_after_unpaid_capital:  0,
                    consideration_cash:           torCash || null,
                    consideration_otherwise_cash: torOC   || null,
                    no_consideration:             0,
                    transactional_consideration:  torTotal || null,
                    remarks: transferor_remarks || null,
                },
                // Transferee — adding qty shares to their holding
                {
                    ...ledgerCommon,
                    share_transaction_id:  inTxn.share_transaction_id,
                    ledger_scope:          'SHAREHOLDER',
                    official_type:         transferee_type,
                    official_entity_id:    transferee_entity_id,
                    transaction_status:    'IN',
                    action_type:           'ADD',
                    posting_order:         2,
                    folio_no:              transferee_folio_no || null,
                    share_cert_no:         transferee_cert_no  || null,
                    old_share_cert_no:     sourceTxn.share_cert_no || null,
                    qty_in:                qty,
                    qty_out:               0,
                    issued_capital_in:     issued,
                    issued_capital_out:    0,
                    paidup_capital_in:     issued,
                    paidup_capital_out:    0,
                    unpaid_capital_in:     0,
                    unpaid_capital_out:    0,
                    guarantee_amount_in:   0,
                    guarantee_amount_out:  0,
                    balance_before_qty:            prevTeeQty,
                    balance_after_qty:             prevTeeQty    + qty,
                    balance_before_issued_capital: prevTeeIssued,
                    balance_after_issued_capital:  prevTeeIssued + issued,
                    balance_before_paidup_capital: prevTeePaidup,
                    balance_after_paidup_capital:  prevTeePaidup + issued,
                    balance_before_unpaid_capital: 0,
                    balance_after_unpaid_capital:  0,
                    consideration_cash:           tcCash   || null,
                    consideration_otherwise_cash: tcOC     || null,
                    no_consideration:             tcNoConsid,
                    transactional_consideration:  tcNoConsid ? null : (tcTotal || null),
                    remarks: transferee_remarks || null,
                },
            ]);

            return responseHandler.returnSuccess(httpStatus.CREATED, 'Transfer saved successfully', {
                share_id:     shareHeader.share_id,
                share_set_id,
                out_txn_id:   outTxn.share_transaction_id,
                in_txn_id:    inTxn.share_transaction_id,
            });

        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── LIST TRANSACTIONS (for ShareholderSharesListPage) ────────────────────

    listByEntity = async (params) => {
        try {
            const models  = getCurrentModels();
            const page    = parseInt(params.page  || 1,   10);
            const limit   = parseInt(params.limit || 100, 10);
            const offset  = (page - 1) * limit;

            const where = { entity_id: params.entity_id, is_deleted: 0 };
            if (params.company_share_id)    where.company_share_id    = params.company_share_id;
            if (params.official_entity_id)  where.official_entity_id  = params.official_entity_id;
            if (params.status)              where.status              = params.status;
            if (params.transaction_status)  where.transaction_status  = params.transaction_status;

            const result = await this.txnDao.findAndCountAll({
                where,
                include:  this._txnIncludes(models),
                limit,
                offset,
                order: [['created_at', 'DESC']],
            });

            return responseHandler.returnSuccess(httpStatus.OK, 'Transactions fetched', {
                totalItems:  result.count,
                data:        result.rows,
                totalPages:  Math.ceil(result.count / limit),
                currentPage: page,
            });
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── SHAREHOLDER HISTORY ──────────────────────────────────────────────────

    // Returns a lightweight share summary for a list of company entity_ids.
    // Used by the Company List page to show shareholders count + total shares + classes.
    companyShareSummary = async (entity_ids) => {
        try {
            const models = getCurrentModels();
            const ids    = (Array.isArray(entity_ids) ? entity_ids : String(entity_ids).split(',')).map(Number).filter(Boolean);
            if (!ids.length) return responseHandler.returnSuccess(httpStatus.OK, 'No ids', {});

            // ── 1. Shareholder counts per company ────────────────────────────
            // In share_transactions: entity_id = company, official_entity_id = shareholder.
            // Count distinct shareholders (official_entity_id) grouped by company (entity_id).
            const holderRows = await this.txnDao.Model.findAll({
                attributes: [
                    'entity_id',
                    [this.txnDao.Model.sequelize.fn('COUNT', this.txnDao.Model.sequelize.fn('DISTINCT', this.txnDao.Model.sequelize.col('official_entity_id'))), 'holder_count'],
                ],
                where: {
                    entity_id: { [Op.in]: ids },
                    transaction_status: { [Op.in]: ['IN', 'NONE'] },
                    is_deleted: 0,
                },
                group: ['entity_id'],
                raw: true,
            });

            // ── 2. Share classes + totals per company ─────────────────────────
            const shareRows = models.entity_shares ? await models.entity_shares.findAll({
                attributes: ['entity_id', 'number_of_shares', 'issued_share_capital', 'paid_up_capital', 'share_class_id'],
                where: { entity_id: { [Op.in]: ids }, is_deleted: 0 },
                include: models.share_class_master ? [{
                    model: models.share_class_master, as: 'share_class',
                    required: false, attributes: ['sc_name'],
                }] : [],
                raw: true, nest: true,
            }) : [];

            // ── 3. Merge into a map keyed by entity_id ────────────────────────
            const summary = {};
            ids.forEach(id => {
                summary[id] = { holder_count: 0, total_shares: 0, total_issued: 0, total_paidup: 0, classes: [] };
            });
            holderRows.forEach(r => {
                if (summary[r.entity_id]) summary[r.entity_id].holder_count = Number(r.holder_count || 0);
            });
            shareRows.forEach(r => {
                const s = summary[r.entity_id];
                if (!s) return;
                const shares = Number(r.number_of_shares    || 0);
                const issued = Number(r.issued_share_capital || 0);
                const paidup = Number(r.paid_up_capital      || 0);
                s.total_shares += shares;
                s.total_issued += issued;
                s.total_paidup += paidup;
                const cls = r.share_class?.sc_name;
                if (cls) {
                    const existing = s.classes.find(c => c.name === cls);
                    if (existing) {
                        existing.shares += shares;
                        existing.issued += issued;
                        existing.paidup += paidup;
                    } else {
                        s.classes.push({ name: cls, shares, issued, paidup });
                    }
                }
            });

            return responseHandler.returnSuccess(httpStatus.OK, 'Share summary fetched', summary);
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    shareholderHistory = async (official_entity_id, entity_id) => {
        try {
            const models = getCurrentModels();
            const rows = await this.txnDao.Model.findAll({
                where:   { entity_id, official_entity_id, is_deleted: 0 },
                include: this._txnIncludes(models),
                order:   [
                    [{ model: models.shares, as: 'share_header' }, 'transaction_date', 'ASC'],
                    ['created_at', 'ASC'],
                ],
            });
            return responseHandler.returnSuccess(httpStatus.OK, 'Shareholder history fetched', rows);
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── GET SINGLE ───────────────────────────────────────────────────────────

    get = async (id) => {
        try {
            const models = getCurrentModels();
            const txn = await this.txnDao.Model.findOne({
                where:   { share_transaction_id: id, is_deleted: 0 },
                include: this._txnIncludes(models),
            });
            if (!txn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transaction not found');
            return responseHandler.returnSuccess(httpStatus.OK, 'Transaction fetched', txn);
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── RETAIN (reverse a transfer) ──────────────────────────────────────────

    retainShare = async (txn_id, userId) => {
        try {
            // Load the transaction
            const txn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: txn_id, is_deleted: 0 },
                raw: true,
            });
            if (!txn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transaction not found');
            if (txn.status !== 'VALID') return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only VALID transactions can be retained');

            // Must be a TRANSFER type
            const shareHeader = await this.shareDao.Model.findOne({ where: { share_id: txn.share_id }, raw: true });
            if (!shareHeader || shareHeader.extra_type_of_transaction !== 'TRANSFER') {
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only transfer transactions can be retained');
            }

            // Combine rows: retain not supported (combined rows merge multiple source allotments)
            if (txn.combine_share_id) {
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'This transfer was created using Combine Holdings and cannot be automatically reversed. Please adjust the records manually.');
            }

            // Resolve OUT and IN rows from whichever side was clicked
            let outTxn = null, inTxn = null;
            if (txn.transaction_status === 'NONE') {
                outTxn = txn;
                if (txn.transferee_share_transaction_id) {
                    inTxn = await this.txnDao.Model.findOne({
                        where: { share_transaction_id: txn.transferee_share_transaction_id, is_deleted: 0 },
                        raw: true,
                    });
                }
            } else if (txn.transaction_status === 'IN') {
                inTxn = txn;
                if (txn.transferor_share_transaction_id) {
                    outTxn = await this.txnDao.Model.findOne({
                        where: { share_transaction_id: txn.transferor_share_transaction_id, is_deleted: 0 },
                        raw: true,
                    });
                }
            } else {
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cannot retain this transaction type');
            }

            // Check for combine on paired row too
            if (outTxn?.combine_share_id || inTxn?.combine_share_id) {
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'This transfer was created using Combine Holdings and cannot be automatically reversed. Please adjust the records manually.');
            }

            // Source (original allotment that was invalidated)
            const sourceId = txn.old_share_id;
            if (!sourceId) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source transaction reference not found');
            const sourceTxn = await this.txnDao.Model.findOne({ where: { share_transaction_id: sourceId, is_deleted: 0 }, raw: true });
            if (!sourceTxn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Source transaction not found');
            if (sourceTxn.status !== 'INVALID') return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source transaction is not in the expected INVALID state');

            // Guard: ensure the transferee hasn't already re-transferred these shares
            if (inTxn) {
                const furtherUse = await this.txnDao.Model.findOne({
                    where: { old_share_id: inTxn.share_transaction_id, is_deleted: 0, status: 'VALID' },
                    raw: true,
                });
                if (furtherUse) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cannot retain: the transferee has already used these shares in another transaction');
            }

            // ── Execute ──────────────────────────────────────────────────────
            const txnIdsToInvalidate = [outTxn, inTxn].filter(Boolean).map(r => r.share_transaction_id);

            await Promise.all([
                // Restore source
                this.txnDao.Model.update({ status: 'VALID', updated_by: userId }, { where: { share_transaction_id: sourceId } }),
                // Invalidate OUT + IN rows
                this.txnDao.Model.update({ status: 'INVALID', updated_by: userId }, { where: { share_transaction_id: txnIdsToInvalidate } }),
                // Soft-delete their payments
                this.paymentDao.Model.update({ is_deleted: 1, updated_by: userId }, { where: { share_transaction_id: txnIdsToInvalidate } }),
                // Soft-delete ledger rows for this transfer header
                this.ledgerDao.Model.update({ is_deleted: 1, updated_by: userId }, { where: { share_id: txn.share_id } }),
                // Soft-delete the share header itself
                this.shareDao.updateWhere({ is_deleted: 1, updated_by: userId }, { share_id: txn.share_id }),
            ]);

            return responseHandler.returnSuccess(httpStatus.OK, 'Shares retained successfully');
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── CREATE CLUB TRANSFER ─────────────────────────────────────────────────
    //
    // Clubs N source certs (same transferor, same company_share_id) into one pool,
    // then splits the pool between a transferee (IN) and a balance retained by the
    // transferor (NONE).  The list of source txn IDs is stored in old_data so that
    // retainClubTransfer can restore every cert if the operation is reversed.
    //
    // type_of_value === 'same'      — weighted-avg per share; consideration split pro-rata
    // type_of_value === 'different' — user specifies transferee paid-up; per share differs

    createClubTransfer = async (body, userId) => {
        try {
            const models = getCurrentModels();

            const {
                entity_id,
                source_txn_ids,           // array of source txn IDs (min 2)
                transferee_official_id,
                transfer_qty,
                type_of_value = 'same',   // 'same' | 'different'
                transfer_date,
                transfer_no,
                // Cert / folio
                transferee_folio_no,
                transferee_cert_no,
                balance_cert_no,
                // Different-mode: user-specified transferee amounts
                transferee_paidup,        // paid-up capital for transferee
                transferee_issued,        // issued capital for transferee
                // Instalment
                transferee_has_instalment,
                transferor_has_instalment,
                // Stamp duty — transferee
                transferee_stamp_duty,
                transferee_stamp_duty_date,
                transferee_stamp_duty_amount,
                // Stamp duty — transferor
                transferor_stamp_duty,
                transferor_stamp_duty_date,
                transferor_stamp_duty_amount,
                // Remarks
                transferee_remarks,
                transferor_remarks,
            } = body;

            // ── Validation ────────────────────────────────────────────────────
            if (!entity_id)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'entity_id is required');
            if (!Array.isArray(source_txn_ids) || source_txn_ids.length < 2)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Club transfer requires at least 2 source certificates');
            if (!transferee_official_id)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Transferee shareholder is required');
            if (!transfer_qty || Number(transfer_qty) <= 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Transfer quantity must be greater than 0');
            if (!transfer_date)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Transfer date is required');

            // ── Load & validate all source transactions ───────────────────────
            // Accept both IN (allotment) and NONE (balance cert from prior transfer)
            const sourceTxns = await this.txnDao.Model.findAll({
                where: {
                    share_transaction_id: { [Op.in]: source_txn_ids.map(Number) },
                    is_deleted: 0,
                    transaction_status: { [Op.in]: ['IN', 'NONE'] },
                    status: 'VALID',
                },
                raw: true,
            });

            if (sourceTxns.length !== source_txn_ids.length)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'One or more source certificates are invalid or already used');

            // All sources must belong to the same transferor and same share class
            const firstSrc       = sourceTxns[0];
            const sameTransferor = sourceTxns.every(t => String(t.official_entity_id) === String(firstSrc.official_entity_id));
            const sameShareClass = sourceTxns.every(t => String(t.share_class_id)     === String(firstSrc.share_class_id));
            if (!sameTransferor)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'All source certificates must belong to the same shareholder');
            if (!sameShareClass)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'All source certificates must be for the same share class');

            // ── Pool totals ───────────────────────────────────────────────────
            const totalShares = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares         || 0), 0);
            const totalCash   = sourceTxns.reduce((s, t) => s + Number(t.cash                 || 0), 0);
            const totalOC     = sourceTxns.reduce((s, t) => s + Number(t.otherwise_cash       || 0), 0);
            const totalConsid = totalCash + totalOC;
            const totalIssued = sourceTxns.reduce((s, t) => s + Number(t.issued_share_capital || 0), 0);

            // ── Snapshot source entity_shares for reduction + retain restore ──
            const { snapshot: sourceESSnap, reductionMap: sourceByCSId } =
                await buildSourceESContext(sourceTxns, models);

            const teeQty = Number(transfer_qty);
            if (teeQty > totalShares)
                return responseHandler.returnError(httpStatus.BAD_REQUEST,
                    `Transfer quantity (${teeQty}) exceeds pool total (${totalShares})`);
            const balQty = totalShares - teeQty;

            // ── Consideration split ───────────────────────────────────────────
            const isDiff = type_of_value === 'different';

            let teeConsid, teeIssuedAmt, balConsid, balIssuedAmt, teePerShare, balPerShare;

            if (isDiff) {
                teeConsid    = Math.min(Number(transferee_paidup || 0), totalConsid);
                teeIssuedAmt = Math.min(Number(transferee_issued || 0), totalIssued);
                balConsid    = parseFloat((totalConsid - teeConsid).toFixed(6));
                balIssuedAmt = parseFloat((totalIssued - teeIssuedAmt).toFixed(6));
                teePerShare  = teeQty > 0 ? teeConsid  / teeQty : 0;
                balPerShare  = balQty > 0 ? balConsid  / balQty : 0;
            } else {
                // Same mode: weighted-average per share
                const weightedPS = totalShares > 0 ? totalConsid / totalShares : 0;
                const teeRatio   = totalShares > 0 ? teeQty / totalShares      : 0;
                teeConsid    = parseFloat((totalConsid * teeRatio).toFixed(6));
                teeIssuedAmt = parseFloat((totalIssued * teeRatio).toFixed(6));
                balConsid    = parseFloat((totalConsid - teeConsid).toFixed(6));
                balIssuedAmt = parseFloat((totalIssued - teeIssuedAmt).toFixed(6));
                teePerShare  = weightedPS;
                balPerShare  = weightedPS;
            }

            // Split cash / OC by the same ratio as total consideration
            const considRatio = totalConsid > 0 ? teeConsid / totalConsid : 0;
            const teeCash = parseFloat((totalCash * considRatio).toFixed(6));
            const teeOC   = parseFloat((totalOC   * considRatio).toFixed(6));
            const balCash = parseFloat((totalCash - teeCash).toFixed(6));
            const balOC   = parseFloat((totalOC   - teeOC).toFixed(6));

            // ── Load transferee official ──────────────────────────────────────
            const transfereeOfficial = await models.officials?.findOne({
                where: { official_id: transferee_official_id, is_deleted: 0 },
                attributes: ['official_id', 'official_entity_id', 'official_type'],
            });
            if (!transfereeOfficial)
                return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transferee not found');

            const transferee_entity_id = transfereeOfficial.official_entity_id;
            if (String(transferee_entity_id) === String(firstSrc.official_entity_id))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Transferee cannot be the same as the transferor');

            const transferee_type = mapOfficialType(transfereeOfficial.official_type);

            // ── Resolve TRANSFER transaction_type ─────────────────────────────
            const txType     = await models.transaction_type?.findOne({ where: { t_slug: 'transfer' } });
            const tx_type_id = txType?.t_id || 3;

            const share_set_id = uuidv4();
            const sourceIds    = source_txn_ids.map(Number);

            // ── Create cs_entity_shares entries ──────────────────────────────────
            // Same mode: one entry for the total pool (both certs reference it —
            //   same per_share so they belong to the same price tranche).
            // Different mode: two entries (teeEntityShare + balEntityShare) because
            //   each cert has a distinct per_share and must have its own tranche.
            const esBase = {
                models, entity_id,
                currency:       firstSrc.currency,
                share_class_id: firstSrc.share_class_id,
                share_type:     firstSrc.share_type || 'NORMAL',
                date:           transfer_date,
                txnType:        'club_transfer',
                userId,
            };

            let teeEntityShare, balEntityShare;
            if (!isDiff) {
                // Same mode — one shared entity_shares for the whole pool
                teeEntityShare = await createEntityShareEntry({
                    ...esBase,
                    shares:   totalShares,
                    issued:   totalIssued,
                    paidup:   totalConsid,
                    perShare: teePerShare,   // == balPerShare in Same mode
                    remarks:  'Created by club transfer',
                });
                balEntityShare = null;      // NONE cert references teeEntityShare
            } else {
                // Different mode — separate entry per cert (different per_share)
                teeEntityShare = await createEntityShareEntry({
                    ...esBase,
                    shares:   teeQty,
                    issued:   teeIssuedAmt,
                    paidup:   teeConsid,
                    perShare: teePerShare,
                    remarks:  'Created by club transfer (transferee)',
                });
                balEntityShare = balQty > 0
                    ? await createEntityShareEntry({
                        ...esBase,
                        shares:   balQty,
                        issued:   balIssuedAmt,
                        paidup:   balConsid,
                        perShare: balPerShare,
                        remarks:  'Created by club transfer (transferor balance)',
                    })
                    : null;
            }

            // ── Create share header ───────────────────────────────────────────
            const shareHeader = await this.shareDao.create({
                entity_id,
                transaction_type_id:       tx_type_id,
                extra_type_of_transaction: 'CLUB_TRANSFER',
                transaction_date:          transfer_date,
                status:                    'VALID',
                source_from:               'MANUAL',
                share_set_id,
                remarks:    transferor_remarks || transferee_remarks || null,
                created_by: userId || null,
                updated_by: userId || null,
            });

            const clubOldData = {
                source_txn_ids:        sourceIds,
                type_of_value,
                club_entity_share_ids: [teeEntityShare.id, ...(balEntityShare ? [balEntityShare.id] : [])],
                source_es_snapshot:    buildESSnapshotForOldData(sourceESSnap),
            };

            const commonFields = {
                share_id:           shareHeader.share_id,
                share_set_id,
                entity_id,
                currency:           firstSrc.currency,
                share_class_id:     firstSrc.share_class_id,
                share_type:         firstSrc.share_type,
                transaction_no:     transfer_no || null,
                issued_per_share:   teePerShare,     // overridden per row below
                old_share_id:       null,            // multiple sources — stored in old_data
                old_share_class_id: firstSrc.share_class_id || null,
                old_currency:       firstSrc.currency        || null,
                old_share_cert_no:  null,
                old_data:           clubOldData,
                data_from:          'MANUAL',
                status:             'VALID',
                is_confirm:         1,
                is_deleted:         0,
                created_by:         userId || null,
                updated_by:         userId || null,
            };

            // ── OUT row — transferor retains balance ──────────────────────────
            // Same mode: balance cert shares the same entity_shares as the IN cert.
            // Different mode: balance cert has its own entity_shares (balEntityShare).
            const outRow = {
                ...commonFields,
                company_share_id:            balEntityShare?.id ?? teeEntityShare.id,
                official_type:               firstSrc.official_type,
                official_entity_id:          firstSrc.official_entity_id,
                transaction_status:          'NONE',
                folio_no:                    firstSrc.folio_no || null,
                share_cert_no:               balance_cert_no || null,
                no_of_shares:                balQty,
                per_share:                   balPerShare,
                issued_per_share:            balPerShare,
                issued_share_capital:        balIssuedAmt,
                paidup_share_capital:        balConsid,
                cash:                        balCash || null,
                otherwise_cash:              balOC   || null,
                no_consideration:            0,
                transactional_consideration: (balCash + balOC) || null,
                transferee_official_entity_id: transferee_entity_id,
                transferee_no_of_shares:     teeQty,
                transferee_issued_capital:   teeIssuedAmt,
                transferee_paidup_capital:   teeConsid,
                is_retain:                   balQty > 0 ? 1 : 0,
                is_ubo:                      firstSrc.is_ubo || 0,
                is_partially_paid:           transferor_has_instalment === 'YES' ? 1 : 0,
                stamp_duty_payment:          transferor_stamp_duty ? 1 : 0,
                stamp_duty_payment_date:     transferor_stamp_duty ? (transferor_stamp_duty_date || null) : null,
                stamp_duty_payment_amount:   transferor_stamp_duty ? (transferor_stamp_duty_amount || null) : null,
            };

            // ── IN row — transferee receives shares ───────────────────────────
            const inRow = {
                ...commonFields,
                company_share_id:            teeEntityShare.id,
                official_type:               transferee_type,
                official_entity_id:          transferee_entity_id,
                transaction_status:          'IN',
                folio_no:                    transferee_folio_no || null,
                share_cert_no:               transferee_cert_no  || null,
                no_of_shares:                teeQty,
                per_share:                   teePerShare,
                issued_per_share:            teePerShare,
                issued_share_capital:        teeIssuedAmt,
                paidup_share_capital:        teeConsid,
                cash:                        teeCash || null,
                otherwise_cash:              teeOC   || null,
                no_consideration:            0,
                transactional_consideration: (teeCash + teeOC) || null,
                transferor_official_entity_id: firstSrc.official_entity_id,
                transferor_no_of_shares:     teeQty,
                transferor_issued_capital:   teeIssuedAmt,
                transferor_paidup_capital:   teeConsid,
                is_retain:                   0,
                is_ubo:                      0,
                is_partially_paid:           transferee_has_instalment === 'YES' ? 1 : 0,
                stamp_duty_payment:          transferee_stamp_duty ? 1 : 0,
                stamp_duty_payment_date:     transferee_stamp_duty ? (transferee_stamp_duty_date || null) : null,
                stamp_duty_payment_amount:   transferee_stamp_duty ? (transferee_stamp_duty_amount || null) : null,
            };

            const outTxn = await this.txnDao.create(outRow);
            const inTxn  = await this.txnDao.create(inRow);

            // ── Post-creation updates ─────────────────────────────────────────
            // Run cs_share_transactions updates SEQUENTIALLY to avoid MySQL
            // deadlock — concurrent UPDATEs on the same table compete for row locks.
            await this.txnDao.Model.update(
                { transferee_share_transaction_id: inTxn.share_transaction_id },
                { where: { share_transaction_id: outTxn.share_transaction_id } }
            );
            await this.txnDao.Model.update(
                { transferor_share_transaction_id: outTxn.share_transaction_id },
                { where: { share_transaction_id: inTxn.share_transaction_id } }
            );
            await this.txnDao.Model.update(
                { status: 'INVALID', updated_by: userId },
                { where: { share_transaction_id: { [Op.in]: sourceIds } } }
            );

            // Reduce / delete source entity_shares so company-share totals stay in
            // sync with the actual valid shareholder transactions.
            await reduceEntityShares({ snapshot: sourceESSnap, reductionMap: sourceByCSId, userId, models });

            // ── Payments ──────────────────────────────────────────────────────
            const payBase = {
                entity_id,
                share_set_id,
                payment_date: transfer_date,
                is_deleted:   0,
                created_by:   userId || null,
                updated_by:   userId || null,
            };
            const paymentRows = [];

            // Transferee IN row consideration
            if (teeCash > 0) paymentRows.push({ ...payBase, share_transaction_id: inTxn.share_transaction_id,  payment_type: 'CASH',                cash: teeCash, otherwise_cash: null, no_consideration: 0 });
            if (teeOC   > 0) paymentRows.push({ ...payBase, share_transaction_id: inTxn.share_transaction_id,  payment_type: 'OTHERWISE_THAN_CASH', cash: null,    otherwise_cash: teeOC, no_consideration: 0 });

            // Transferor NONE row (retained balance consideration)
            if (balQty > 0) {
                if (balCash > 0) paymentRows.push({ ...payBase, share_transaction_id: outTxn.share_transaction_id, payment_type: 'CASH',                cash: balCash, otherwise_cash: null,  no_consideration: 0 });
                if (balOC   > 0) paymentRows.push({ ...payBase, share_transaction_id: outTxn.share_transaction_id, payment_type: 'OTHERWISE_THAN_CASH', cash: null,    otherwise_cash: balOC, no_consideration: 0 });
            }

            if (paymentRows.length) await this.paymentDao.bulkCreate(paymentRows);

            // ── Ledger ────────────────────────────────────────────────────────
            // Transferee prior balance under the new clubbed entity_shares batch is 0
            // (brand-new batch created by this club transfer)
            const prevTeeQty    = 0;
            const prevTeeIssued = 0;
            const prevTeePaidup = 0;

            const ledgerCommon = {
                entity_id,
                share_id:            shareHeader.share_id,
                share_set_id,
                transaction_type_id: tx_type_id,
                transaction_date:    transfer_date,
                transaction_no:      transfer_no || null,
                currency:            firstSrc.currency,
                share_class_id:      firstSrc.share_class_id,
                share_type:          firstSrc.share_type || 'NORMAL',
                status:              'VALID',
                source_from:         'MANUAL',
                is_deleted:          0,
                created_by:          userId || null,
                updated_by:          userId || null,
            };

            await this.ledgerDao.bulkCreate([
                // Transferor — removing teeQty from total pool
                {
                    ...ledgerCommon,
                    company_share_id:      balEntityShare?.id || null,
                    share_transaction_id:  outTxn.share_transaction_id,
                    ledger_scope:          'SHAREHOLDER',
                    official_type:         firstSrc.official_type,
                    official_entity_id:    firstSrc.official_entity_id,
                    transaction_status:    'NONE',
                    action_type:           'REMOVE',
                    posting_order:         1,
                    folio_no:              firstSrc.folio_no || null,
                    share_cert_no:         balance_cert_no || null,
                    old_share_cert_no:     null,
                    qty_in:                0,
                    qty_out:               teeQty,
                    issued_capital_in:     0,
                    issued_capital_out:    teeIssuedAmt,
                    paidup_capital_in:     0,
                    paidup_capital_out:    teeConsid,
                    unpaid_capital_in:     0,
                    unpaid_capital_out:    0,
                    guarantee_amount_in:   0,
                    guarantee_amount_out:  0,
                    balance_before_qty:            totalShares,
                    balance_after_qty:             balQty,
                    balance_before_issued_capital: totalIssued,
                    balance_after_issued_capital:  balIssuedAmt,
                    balance_before_paidup_capital: totalConsid,
                    balance_after_paidup_capital:  balConsid,
                    balance_before_unpaid_capital: 0,
                    balance_after_unpaid_capital:  0,
                    consideration_cash:           balCash || null,
                    consideration_otherwise_cash: balOC   || null,
                    no_consideration:             0,
                    transactional_consideration:  (balCash + balOC) || null,
                    remarks: transferor_remarks || null,
                },
                // Transferee — adding teeQty to their holding
                {
                    ...ledgerCommon,
                    company_share_id:      teeEntityShare.id,
                    share_transaction_id:  inTxn.share_transaction_id,
                    ledger_scope:          'SHAREHOLDER',
                    official_type:         transferee_type,
                    official_entity_id:    transferee_entity_id,
                    transaction_status:    'IN',
                    action_type:           'ADD',
                    posting_order:         2,
                    folio_no:              transferee_folio_no || null,
                    share_cert_no:         transferee_cert_no  || null,
                    old_share_cert_no:     null,
                    qty_in:                teeQty,
                    qty_out:               0,
                    issued_capital_in:     teeIssuedAmt,
                    issued_capital_out:    0,
                    paidup_capital_in:     teeConsid,
                    paidup_capital_out:    0,
                    unpaid_capital_in:     0,
                    unpaid_capital_out:    0,
                    guarantee_amount_in:   0,
                    guarantee_amount_out:  0,
                    balance_before_qty:            prevTeeQty,
                    balance_after_qty:             prevTeeQty    + teeQty,
                    balance_before_issued_capital: prevTeeIssued,
                    balance_after_issued_capital:  prevTeeIssued + teeIssuedAmt,
                    balance_before_paidup_capital: prevTeePaidup,
                    balance_after_paidup_capital:  prevTeePaidup + teeConsid,
                    balance_before_unpaid_capital: 0,
                    balance_after_unpaid_capital:  0,
                    consideration_cash:           teeCash || null,
                    consideration_otherwise_cash: teeOC   || null,
                    no_consideration:             0,
                    transactional_consideration:  (teeCash + teeOC) || null,
                    remarks: transferee_remarks || null,
                },
            ]);

            return responseHandler.returnSuccess(httpStatus.CREATED, 'Club transfer saved successfully', {
                share_id:     shareHeader.share_id,
                share_set_id,
                out_txn_id:   outTxn.share_transaction_id,
                in_txn_id:    inTxn.share_transaction_id,
            });

        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── RETAIN CLUB TRANSFER ─────────────────────────────────────────────────
    //
    // Reverses a club transfer: restores all source certificates to VALID,
    // then invalidates the single OUT + IN rows the club transfer created.

    retainClubTransfer = async (txn_id, userId) => {
        try {
            const models = getCurrentModels();
            const txn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: txn_id, is_deleted: 0 },
                raw: true,
            });
            if (!txn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transaction not found');
            if (txn.status !== 'VALID')
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only VALID transactions can be retained');

            // Must be a CLUB_TRANSFER header
            const shareHeader = await this.shareDao.Model.findOne({ where: { share_id: txn.share_id }, raw: true });
            if (!shareHeader || shareHeader.extra_type_of_transaction !== 'CLUB_TRANSFER')
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only club transfer transactions can be retained here');

            // Resolve the OUT and IN rows from whichever side was clicked
            let outTxn = null, inTxn = null;
            if (txn.transaction_status === 'NONE') {
                outTxn = txn;
                if (txn.transferee_share_transaction_id) {
                    inTxn = await this.txnDao.Model.findOne({
                        where: { share_transaction_id: txn.transferee_share_transaction_id, is_deleted: 0 },
                        raw: true,
                    });
                }
            } else if (txn.transaction_status === 'IN') {
                inTxn = txn;
                if (txn.transferor_share_transaction_id) {
                    outTxn = await this.txnDao.Model.findOne({
                        where: { share_transaction_id: txn.transferor_share_transaction_id, is_deleted: 0 },
                        raw: true,
                    });
                }
            } else {
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cannot retain this transaction type');
            }

            // Retrieve source txn IDs from old_data
            const oldData = (outTxn || inTxn)?.old_data;
            const sourceIds = oldData?.source_txn_ids;
            if (!Array.isArray(sourceIds) || sourceIds.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source certificate references not found in old_data');

            // Guard: ensure transferee hasn't re-transferred their shares
            if (inTxn) {
                const furtherUse = await this.txnDao.Model.findOne({
                    where: { old_share_id: inTxn.share_transaction_id, is_deleted: 0, status: 'VALID' },
                    raw: true,
                });
                if (furtherUse)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cannot retain: the transferee has already used these shares in another transaction');
            }

            // Verify all source txns are in INVALID state (as expected after club transfer)
            const sourceTxns = await this.txnDao.Model.findAll({
                where: { share_transaction_id: { [Op.in]: sourceIds.map(Number) }, is_deleted: 0 },
                raw: true,
            });
            const allInvalid = sourceTxns.every(t => t.status === 'INVALID');
            if (!allInvalid)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Unexpected state: not all source certificates are in INVALID status');

            const txnIdsToInvalidate = [outTxn, inTxn].filter(Boolean).map(r => r.share_transaction_id);

            const retainOps = [
                // Restore all source transactions
                this.txnDao.Model.update(
                    { status: 'VALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: sourceIds.map(Number) } } }
                ),
                // Invalidate OUT + IN rows
                this.txnDao.Model.update(
                    { status: 'INVALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: txnIdsToInvalidate } } }
                ),
                // Soft-delete their payments
                this.paymentDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: txnIdsToInvalidate } } }
                ),
                // Soft-delete ledger rows for this club transfer header
                this.ledgerDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_id: txn.share_id } }
                ),
                // Soft-delete the share header itself
                this.shareDao.updateWhere(
                    { is_deleted: 1, updated_by: userId },
                    { share_id: txn.share_id }
                ),
            ];

            // Soft-delete club entity_shares entries (newer: array; older: single id)
            const clubEsIds = oldData?.club_entity_share_ids ||
                (oldData?.club_entity_share_id ? [oldData.club_entity_share_id] : []);

            await Promise.all(retainOps);

            // Run entity_shares operations after the transaction-level ops
            await deleteEntityShares(clubEsIds, userId, models);
            await restoreEntitySharesSnapshot(oldData?.source_es_snapshot, userId, models);

            return responseHandler.returnSuccess(httpStatus.OK, 'Club transfer retained (reversed) successfully');
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── DELETE ───────────────────────────────────────────────────────────────

    // ── CREATE DISSOLVE ──────────────────────────────────────────────────────
    //
    // Dissolve = full transfer of a shareholder's cert(s) to one or more
    // transferees.  No balance cert remains for the transferor.
    //
    // dissolve_type 'separate' — each source cert dissolves to one transferee
    //                            (certs[i] → transferees[i], 1-to-1 mapping)
    // dissolve_type 'club'     — all source certs are pooled, then the pool is
    //                            split among multiple transferees (like club
    //                            transfer but with no balance)

    createDissolve = async (body, userId) => {
        try {
            const models = getCurrentModels();
            const {
                entity_id,
                source_txn_ids,
                dissolve_date,
                dissolve_no,
                dissolve_type = 'separate',
                transferees = [],            // array of transferee objects
            } = body;

            if (!entity_id)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'entity_id is required');
            if (!Array.isArray(source_txn_ids) || source_txn_ids.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'At least one source certificate is required');
            if (!dissolve_date)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Dissolve date is required');
            if (!Array.isArray(transferees) || transferees.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'At least one transferee is required');

            // ── Load & validate source transactions ───────────────────────────
            const sourceTxns = await this.txnDao.Model.findAll({
                where: {
                    share_transaction_id: { [Op.in]: source_txn_ids.map(Number) },
                    is_deleted:           0,
                    transaction_status:   { [Op.in]: ['IN', 'NONE'] },
                    status:               'VALID',
                },
                raw: true,
            });
            if (sourceTxns.length !== source_txn_ids.length)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'One or more source certificates are invalid or already used');

            const firstSrc       = sourceTxns[0];
            const sameTransferor = sourceTxns.every(t => String(t.official_entity_id) === String(firstSrc.official_entity_id));
            const sameShareClass = sourceTxns.every(t => String(t.share_class_id)     === String(firstSrc.share_class_id));
            if (!sameTransferor)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'All source certificates must belong to the same shareholder');
            if (!sameShareClass)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'All source certificates must be for the same share class');

            const totalSourceShares = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
            const totalTeeShares    = transferees.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
            if (Math.abs(totalTeeShares - totalSourceShares) > 0.0001)
                return responseHandler.returnError(httpStatus.BAD_REQUEST,
                    `Total transferee shares (${totalTeeShares}) must equal total source shares (${totalSourceShares})`);

            // ── Resolve dissolve transaction type ─────────────────────────────
            const txType     = await models.transaction_type?.findOne({ where: { t_slug: 'dissolved' } });
            const tx_type_id = txType?.t_id || 4;

            const share_set_id = uuidv4();
            const sourceIds    = source_txn_ids.map(Number);

            // ── Club dissolve: snapshot source entity_shares and pre-create new ones ──
            // Source certs have different per_share values (e.g. 1.0, 2.0); after clubbing
            // all shares move to a weighted-average per_share — so the old pools must shrink
            // and new entity_shares entries created at the new per_share.
            let sourceESSnap  = [];
            let sourceByCSId  = {};
            const newESIds    = [];         // ids of entity_shares created for each transferee
            const teeCSIds    = [];         // company_share_id to use per transferee IN row

            if (dissolve_type === 'club') {
                const esCtx = await buildSourceESContext(sourceTxns, models);
                sourceESSnap = esCtx.snapshot;
                sourceByCSId = esCtx.reductionMap;

                const esBase = {
                    models, entity_id,
                    currency:       firstSrc.currency,
                    share_class_id: firstSrc.share_class_id,
                    share_type:     firstSrc.share_type || 'NORMAL',
                    date:           dissolve_date,
                    txnType:        'club_dissolve',
                    userId,
                };
                for (const tee of transferees) {
                    const tShares = Number(tee.no_of_shares || 0);
                    const tPS     = Number(tee.per_share    || 0);
                    const tIssued = Number(tee.issued_capital || tShares * tPS);
                    const tPaidup = Number(tee.paid_capital  || tShares * tPS);
                    const newES = await createEntityShareEntry({
                        ...esBase,
                        shares:   tShares,
                        issued:   tIssued,
                        paidup:   tPaidup,
                        perShare: tPS,
                        remarks:  'Created by club dissolve',
                    });
                    newESIds.push(newES.id);
                    teeCSIds.push(newES.id);
                }
            } else {
                // Separate: per_share unchanged — build a lookup to reuse matching source pool
                const srcByPS = {};
                for (const t of sourceTxns) {
                    const key = Number(t.per_share).toFixed(8);
                    if (!srcByPS[key]) srcByPS[key] = t;
                }
                for (const tee of transferees) {
                    const tPS = Number(tee.per_share || 0);
                    teeCSIds.push((srcByPS[tPS.toFixed(8)] || firstSrc).company_share_id);
                }
            }

            // ── Create share header ───────────────────────────────────────────
            const shareHeader = await this.shareDao.create({
                entity_id,
                transaction_type_id:       tx_type_id,
                extra_type_of_transaction: dissolve_type === 'club' ? 'CLUB_DISSOLVE' : 'DISSOLVE',
                transaction_date:          dissolve_date,
                status:                    'VALID',
                source_from:               'MANUAL',
                share_set_id,
                remarks:                   dissolve_no || null,
                created_by:                userId || null,
                updated_by:                userId || null,
            });
            if (!shareHeader) throw new Error('Failed to create dissolve share header');

            const dissolveOldData = {
                source_txn_ids:    sourceIds,
                dissolve_type,
                dissolve_es_ids:    newESIds,
                source_es_snapshot: buildESSnapshotForOldData(sourceESSnap),
            };

            // ── For each transferee: load official and create IN txn ──────────────
            const inTxns = [];

            for (let i = 0; i < transferees.length; i++) {
                const tee = transferees[i];

                const teeShares = Number(tee.no_of_shares || 0);
                const teePS     = Number(tee.per_share    || 0);
                const teeIssued = Number(tee.issued_capital || teeShares * teePS);
                const teePaidup = Number(tee.paid_capital  || teeShares * teePS);

                // Load official
                const teeOfficial = await models.officials?.findOne({
                    where: { official_id: tee.official_id, is_deleted: 0 },
                    attributes: ['official_id', 'official_entity_id', 'official_type'],
                });
                if (!teeOfficial)
                    return responseHandler.returnError(httpStatus.NOT_FOUND, `Transferee #${i + 1} not found`);

                const teeEntityId = teeOfficial.official_entity_id;
                const teeType     = mapOfficialType(teeOfficial.official_type);

                const teeCompShareId = teeCSIds[i];

                // Source cert for old_share_id reference
                const srcTxn = dissolve_type === 'separate' ? (sourceTxns[i] || firstSrc) : firstSrc;

                const teeCash = Number(tee.cash || 0);
                const teeOC   = Number(tee.oc   || 0);
                const teeNoConsid = tee.no_consideration ? 1 : 0;

                const inRow = {
                    share_id:                    shareHeader.share_id,
                    share_set_id,
                    company_share_id:            teeCompShareId,
                    entity_id,
                    currency:                    firstSrc.currency,
                    share_class_id:              firstSrc.share_class_id,
                    share_type:                  firstSrc.share_type,
                    transaction_no:              dissolve_no || null,
                    official_type:               teeType,
                    official_entity_id:          teeEntityId,
                    transaction_status:          'IN',
                    folio_no:                    tee.folio_no   || null,
                    share_cert_no:               tee.cert_no    || null,
                    no_of_shares:                teeShares,
                    per_share:                   teePS,
                    issued_per_share:            teePS,
                    issued_share_capital:        teeIssued,
                    paidup_share_capital:        teePaidup,
                    cash:                        teeCash || null,
                    otherwise_cash:              teeOC   || null,
                    no_consideration:            teeNoConsid,
                    transactional_consideration: teeNoConsid ? null : ((teeCash + teeOC) || null),
                    transferor_official_entity_id: firstSrc.official_entity_id,
                    transferor_no_of_shares:     teeShares,
                    transferor_issued_capital:   teeIssued,
                    transferor_paidup_capital:   teePaidup,
                    old_share_id:                srcTxn.share_transaction_id,
                    old_share_class_id:          firstSrc.share_class_id || null,
                    old_currency:                firstSrc.currency        || null,
                    old_share_cert_no:           srcTxn.share_cert_no    || null,
                    old_data:                    dissolveOldData,
                    is_retain:                   0,
                    is_ubo:                      0,
                    is_partially_paid:           tee.has_instalment === 'YES' ? 1 : 0,
                    stamp_duty_payment:          tee.stamp_duty ? 1 : 0,
                    stamp_duty_payment_date:     tee.stamp_duty ? (tee.stamp_duty_date || null) : null,
                    stamp_duty_payment_amount:   tee.stamp_duty ? (tee.stamp_duty_amount || null) : null,
                    data_from:                   'MANUAL',
                    status:                      'VALID',
                    is_confirm:                  1,
                    is_deleted:                  0,
                    created_by:                  userId || null,
                    updated_by:                  userId || null,
                };

                const inTxn = await this.txnDao.create(inRow);
                if (!inTxn) throw new Error(`Failed to create transaction for transferee #${i + 1}`);
                inTxns.push(inTxn);
            }

            // ── Invalidate all source transactions ────────────────────────────
            await this.txnDao.Model.update(
                { status: 'INVALID', updated_by: userId },
                { where: { share_transaction_id: { [Op.in]: sourceIds } } }
            );

            // ── Club dissolve: reduce/soft-delete old entity_shares pools ─────
            // Old per_share pools (e.g. 1.0, 2.0) are replaced by the new weighted-
            // average pool created above; reduce their share counts accordingly.
            if (dissolve_type === 'club' && sourceESSnap.length > 0) {
                await reduceEntityShares({ snapshot: sourceESSnap, reductionMap: sourceByCSId, userId, models });
            }

            // ── Payments ──────────────────────────────────────────────────────
            const payBase = { entity_id, share_set_id, payment_date: dissolve_date, is_deleted: 0, created_by: userId || null, updated_by: userId || null };
            const paymentRows = [];
            for (let i = 0; i < transferees.length; i++) {
                const tee   = transferees[i];
                const inTxn = inTxns[i];
                const teeCash     = Number(tee.cash || 0);
                const teeOC       = Number(tee.oc   || 0);
                const teeNoConsid = tee.no_consideration ? 1 : 0;
                if (teeNoConsid) {
                    paymentRows.push({ ...payBase, share_transaction_id: inTxn.share_transaction_id, payment_type: 'NO_CONSIDERATION', cash: null, otherwise_cash: null, no_consideration: 1 });
                } else {
                    if (teeCash > 0) paymentRows.push({ ...payBase, share_transaction_id: inTxn.share_transaction_id, payment_type: 'CASH',                cash: teeCash, otherwise_cash: null, no_consideration: 0 });
                    if (teeOC   > 0) paymentRows.push({ ...payBase, share_transaction_id: inTxn.share_transaction_id, payment_type: 'OTHERWISE_THAN_CASH', cash: null,    otherwise_cash: teeOC, no_consideration: 0 });
                }
            }
            if (paymentRows.length) await this.paymentDao.bulkCreate(paymentRows);

            return responseHandler.returnSuccess(httpStatus.CREATED, 'Dissolve saved successfully', {
                share_id:     shareHeader.share_id,
                share_set_id,
                in_txn_ids:   inTxns.map(t => t.share_transaction_id),
            });

        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── RETAIN DISSOLVE ──────────────────────────────────────────────────────

    retainDissolve = async (txn_id, userId) => {
        try {
            const models = getCurrentModels();
            const txn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: txn_id, is_deleted: 0 },
                raw: true,
            });
            if (!txn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transaction not found');
            if (txn.status !== 'VALID')
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only VALID transactions can be retained');

            const shareHeader = await this.shareDao.Model.findOne({ where: { share_id: txn.share_id }, raw: true });
            if (!shareHeader || !['DISSOLVE', 'CLUB_DISSOLVE'].includes(shareHeader.extra_type_of_transaction))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only dissolve transactions can be retained here');

            const oldData   = txn.old_data;
            const sourceIds = oldData?.source_txn_ids;
            if (!Array.isArray(sourceIds) || sourceIds.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source certificate references not found');

            // Find all IN rows for this dissolve header
            const allInTxns = await this.txnDao.Model.findAll({
                where: { share_id: txn.share_id, transaction_status: 'IN', is_deleted: 0 },
                raw: true,
            });

            // Guard: none of the transferees should have re-used their shares
            for (const inTxn of allInTxns) {
                const furtherUse = await this.txnDao.Model.findOne({
                    where: { old_share_id: inTxn.share_transaction_id, is_deleted: 0, status: 'VALID' },
                    raw: true,
                });
                if (furtherUse)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cannot retain: a transferee has already used their shares');
            }

            const inTxnIds = allInTxns.map(t => t.share_transaction_id);

            await Promise.all([
                // Restore source transactions
                this.txnDao.Model.update(
                    { status: 'VALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: sourceIds.map(Number) } } }
                ),
                // Invalidate all IN rows
                this.txnDao.Model.update(
                    { status: 'INVALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: inTxnIds } } }
                ),
                // Soft-delete payments
                this.paymentDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: inTxnIds } } }
                ),
                // Soft-delete ledger rows
                this.ledgerDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_id: txn.share_id } }
                ),
                // Soft-delete share header
                this.shareDao.updateWhere(
                    { is_deleted: 1, updated_by: userId },
                    { share_id: txn.share_id }
                ),
            ]);

            // For legacy dissolves that tracked entity_shares changes, undo them
            const dissolveEsIds = oldData?.dissolve_es_ids || [];
            if (dissolveEsIds.length > 0) {
                await deleteEntityShares(dissolveEsIds, userId, models);
                await restoreEntitySharesSnapshot(oldData?.source_es_snapshot, userId, models);
            }

            return responseHandler.returnSuccess(httpStatus.OK, 'Dissolve retained (reversed) successfully');
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── CREATE CANCEL ────────────────────────────────────────────────────────
    //
    // Cancels one or more share certificates.  For each cert:
    //   - source cert → INVALID
    //   - if partial cancellation (cancelShares < source): create new IN row
    //     for remaining shares (same holder, new cert no.)
    //   - separate mode: entity_shares untouched (per_share unchanged)
    //   - club mode: source pools reduced, balance moved to a new weighted pool
    //
    // body: { entity_id, cancel_no, cancel_date, items: [{
    //   source_txn_id, no_of_shares_cancelled, per_share,
    //   cancel_issued_capital, cancel_paid_capital,
    //   remaining_shares?, new_cert_no?, new_folio_no?,
    //   rem_cash?, rem_oc?, rem_no_consideration?
    // }] }

    createCancel = async (body, userId) => {
        try {
            const models = getCurrentModels();
            const {
                entity_id, cancel_no, cancel_date, remarks,
                affects_company_shares = 1,
                cancel_mode = 'separate',
                items = [],
                // Club-mode extra fields
                club_cancel_shares, club_new_cert_no, club_new_folio_no,
                club_rem_cash, club_rem_oc, club_rem_no_consideration,
            } = body;

            if (!entity_id)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'entity_id is required');
            if (!cancel_date)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cancellation date is required');
            if (!Array.isArray(items) || items.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'At least one item is required');

            // ── Load & validate source transactions ───────────────────────────
            const sourceIds = items.map(it => Number(it.source_txn_id));
            const sourceTxns = await this.txnDao.Model.findAll({
                where: {
                    share_transaction_id: { [Op.in]: sourceIds },
                    is_deleted:           0,
                    transaction_status:   { [Op.in]: ['IN', 'NONE'] },
                    status:               'VALID',
                },
                raw: true,
            });
            if (sourceTxns.length !== items.length)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'One or more source certificates are invalid or already used');

            const srcById = {};
            for (const t of sourceTxns) srcById[t.share_transaction_id] = t;

            // ── Quantity validation ───────────────────────────────────────────
            if (cancel_mode === 'club') {
                const totalShares = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
                const cancelQty   = Number(club_cancel_shares || 0);
                if (cancelQty <= 0 || cancelQty > totalShares)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST,
                        `Invalid club cancel quantity (${cancelQty}) — pool total is ${totalShares}`);
                const balQty = totalShares - cancelQty;
                if (balQty > 0 && !club_new_cert_no)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, 'New cert no. required for partial club cancel');
            } else {
                for (const it of items) {
                    const src = srcById[Number(it.source_txn_id)];
                    const canQty = Number(it.no_of_shares_cancelled || 0);
                    if (canQty <= 0 || canQty > Number(src.no_of_shares || 0))
                        return responseHandler.returnError(httpStatus.BAD_REQUEST,
                            `Invalid cancel quantity for cert ${src.share_cert_no || src.share_transaction_id}`);
                }
            }

            const txType     = await models.transaction_type?.findOne({ where: { t_slug: 'cancel' } });
            const tx_type_id = txType?.t_id || 5;

            const share_set_id = uuidv4();

            // ── Snapshot source entity_shares for reduction ───────────────────
            const { snapshot: esSnap } =
                await buildSourceESContext(sourceTxns, models);

            // ── Create share header ───────────────────────────────────────────
            const shareHeader = await this.shareDao.create({
                entity_id,
                transaction_type_id:       tx_type_id,
                extra_type_of_transaction: cancel_mode === 'club' ? 'CLUB_CANCEL' : 'CANCEL',
                transaction_date:          cancel_date,
                status:                    'VALID',
                source_from:               'MANUAL',
                share_set_id,
                remarks:                   remarks || null,
                created_by:                userId || null,
                updated_by:                userId || null,
            });
            if (!shareHeader) throw new Error('Failed to create cancel share header');

            const cancelOldData = {
                source_txn_ids:         sourceIds,
                cancel_type:            cancel_mode,
                affects_company_shares: cancel_mode === 'club' && Number(affects_company_shares) !== 0 ? 1 : 0,
                source_es_snapshot:     buildESSnapshotForOldData(esSnap),
            };

            // ═══════════════════════════════════════════════════════════════════
            // ── CLUB CANCEL path ────────────────────────────────────────────────
            // ═══════════════════════════════════════════════════════════════════
            if (cancel_mode === 'club') {
                const firstSrc    = sourceTxns[0];
                const totalShares = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
                const totalPaidup = sourceTxns.reduce((s, t) => s + Number(t.paidup_share_capital || 0), 0);
                const clubPS      = totalShares > 0 ? totalPaidup / totalShares : 0;
                const cancelQty   = Number(club_cancel_shares || 0);
                const balQty      = totalShares - cancelQty;

                const txnBase = {
                    share_id: shareHeader.share_id, share_set_id, entity_id,
                    currency: firstSrc.currency, share_class_id: firstSrc.share_class_id,
                    share_type: firstSrc.share_type, transaction_no: cancel_no || null,
                    official_type: firstSrc.official_type, official_entity_id: firstSrc.official_entity_id,
                    folio_no: firstSrc.folio_no || null,
                    is_retain: 0, is_ubo: 0, is_partially_paid: 0, stamp_duty_payment: 0,
                    data_from: 'MANUAL', status: 'VALID', is_confirm: 1, is_deleted: 0,
                    created_by: userId || null, updated_by: userId || null,
                };

                // ── OUT row for cancelled portion ────────────────────────────
                await this.txnDao.create({
                    ...txnBase,
                    company_share_id:     firstSrc.company_share_id,
                    transaction_status:   'OUT',
                    share_cert_no:        null,
                    no_of_shares:         cancelQty,
                    per_share:            clubPS,
                    issued_per_share:     clubPS,
                    issued_share_capital: cancelQty * clubPS,
                    paidup_share_capital: cancelQty * clubPS,
                    old_share_id:         sourceIds[0],
                    old_data:             cancelOldData,
                });

                // ── Balance cert IN row (when partial) ───────────────────────
                const newInTxns = [];
                if (balQty > 0) {
                    // Create new entity_shares pool at weighted per_share
                    let balCSId = firstSrc.company_share_id;
                    if (Number(affects_company_shares) !== 0) {
                        const newES = await createEntityShareEntry({
                            models, entity_id,
                            currency: firstSrc.currency, share_class_id: firstSrc.share_class_id,
                            share_type: firstSrc.share_type || 'NORMAL',
                            date: cancel_date, txnType: 'club_cancel', userId,
                            shares: balQty, issued: balQty * clubPS, paidup: balQty * clubPS,
                            perShare: clubPS, remarks: 'Created by club cancel (balance)',
                        });
                        balCSId = newES.id;
                    }

                    const remCashV = club_rem_no_consideration ? 0 : Number(club_rem_cash || 0);
                    const remOCV   = club_rem_no_consideration ? 0 : Number(club_rem_oc   || 0);
                    const remNoC   = club_rem_no_consideration ? 1 : 0;

                    const inTxn = await this.txnDao.create({
                        ...txnBase,
                        company_share_id:     balCSId,
                        transaction_status:   'IN',
                        folio_no:             club_new_folio_no || firstSrc.folio_no || null,
                        share_cert_no:        club_new_cert_no || null,
                        no_of_shares:         balQty,
                        per_share:            clubPS,
                        issued_per_share:     clubPS,
                        issued_share_capital: balQty * clubPS,
                        paidup_share_capital: balQty * clubPS,
                        cash:                 remCashV || null,
                        otherwise_cash:       remOCV   || null,
                        no_consideration:     remNoC,
                        transactional_consideration: remNoC ? null : ((remCashV + remOCV) || null),
                        transferor_official_entity_id: firstSrc.official_entity_id,
                        transferor_no_of_shares: balQty,
                        transferor_issued_capital: balQty * clubPS,
                        transferor_paidup_capital: balQty * clubPS,
                        old_share_id:  sourceIds[0],
                        old_data:      cancelOldData,
                    });
                    if (!inTxn) throw new Error('Failed to create club balance cert');
                    newInTxns.push(inTxn);

                    if (!remNoC) {
                        const pb = { entity_id, share_set_id, payment_date: cancel_date, is_deleted: 0, created_by: userId || null, updated_by: userId || null };
                        const pr = [];
                        if (remCashV > 0) pr.push({ ...pb, share_transaction_id: inTxn.share_transaction_id, payment_type: 'CASH',                cash: remCashV, otherwise_cash: null, no_consideration: 0 });
                        if (remOCV   > 0) pr.push({ ...pb, share_transaction_id: inTxn.share_transaction_id, payment_type: 'OTHERWISE_THAN_CASH', cash: null,     otherwise_cash: remOCV, no_consideration: 0 });
                        if (pr.length) await this.paymentDao.bulkCreate(pr);
                    }
                }

                // ── Invalidate all source txns ───────────────────────────────
                await this.txnDao.Model.update(
                    { status: 'INVALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: sourceIds } } }
                );

                // ── Reduce all source entity_shares (full amounts) ───────────
                if (Number(affects_company_shares) !== 0) {
                    const sourceByCSId = {};
                    for (const t of sourceTxns) {
                        const csId = String(t.company_share_id);
                        const qty  = Number(t.no_of_shares || 0);
                        const ps   = Number(t.per_share || 0);
                        if (!sourceByCSId[csId]) sourceByCSId[csId] = { shares: 0, issued: 0, paidup: 0 };
                        sourceByCSId[csId].shares += qty;
                        sourceByCSId[csId].issued += qty * ps;
                        sourceByCSId[csId].paidup += qty * ps;
                    }
                    await reduceEntityShares({ snapshot: esSnap, reductionMap: sourceByCSId, userId, models });
                }

                return responseHandler.returnSuccess(httpStatus.CREATED, 'Share cancellation (club) saved successfully', {
                    share_id:   shareHeader.share_id,
                    share_set_id,
                    in_txn_ids: newInTxns.map(t => t.share_transaction_id),
                });
            }

            // ═══════════════════════════════════════════════════════════════════
            // ── SEPARATE CANCEL path (existing logic) ───────────────────────────
            // ═══════════════════════════════════════════════════════════════════

            // ── Process each item ─────────────────────────────────────────────
            const newInTxns = [];

            for (const it of items) {
                const src     = srcById[Number(it.source_txn_id)];
                const canQty  = Number(it.no_of_shares_cancelled);
                const srcPS   = Number(src.per_share || 0);
                const remQty  = Number(src.no_of_shares || 0) - canQty;


                // ── OUT row for the cancelled portion ────────────────────────
                await this.txnDao.create({
                    share_id:                    shareHeader.share_id,
                    share_set_id,
                    company_share_id:            src.company_share_id,
                    entity_id,
                    currency:                    src.currency,
                    share_class_id:              src.share_class_id,
                    share_type:                  src.share_type,
                    transaction_no:              cancel_no || null,
                    official_type:               src.official_type,
                    official_entity_id:          src.official_entity_id,
                    transaction_status:          'OUT',
                    folio_no:                    src.folio_no || null,
                    share_cert_no:               src.share_cert_no || null,
                    no_of_shares:                canQty,
                    per_share:                   srcPS,
                    issued_per_share:             srcPS,
                    issued_share_capital:         canQty * srcPS,
                    paidup_share_capital:         canQty * srcPS,
                    old_share_id:                src.share_transaction_id,
                    old_share_class_id:          src.share_class_id || null,
                    old_currency:                src.currency       || null,
                    old_share_cert_no:           src.share_cert_no  || null,
                    old_data:                    cancelOldData,
                    is_retain:                   0,
                    is_ubo:                      0,
                    is_partially_paid:           0,
                    stamp_duty_payment:          0,
                    data_from:                   'MANUAL',
                    status:                      'VALID',
                    is_confirm:                  1,
                    is_deleted:                  0,
                    created_by:                  userId || null,
                    updated_by:                  userId || null,
                });

                if (remQty > 0) {
                    // Partial cancel: remaining shares stay in the SAME entity_shares pool.
                    // The pool is already reduced by the cancelled amount only (preciseReductionMap below).
                    // Creating a new ES entry here would double-count the remaining shares.
                    const remCSId = src.company_share_id;

                    // Create IN row for remaining shares (same holder)
                    const remCash    = it.rem_no_consideration ? 0 : Number(it.rem_cash || 0);
                    const remOC      = it.rem_no_consideration ? 0 : Number(it.rem_oc   || 0);
                    const remNoC     = it.rem_no_consideration ? 1 : 0;

                    const inRow = {
                        share_id:                    shareHeader.share_id,
                        share_set_id,
                        company_share_id:            remCSId,
                        entity_id,
                        currency:                    src.currency,
                        share_class_id:              src.share_class_id,
                        share_type:                  src.share_type,
                        transaction_no:              cancel_no || null,
                        official_type:               src.official_type,
                        official_entity_id:          src.official_entity_id,
                        transaction_status:          'IN',
                        folio_no:                    it.new_folio_no || src.folio_no || null,
                        share_cert_no:               it.new_cert_no || null,
                        no_of_shares:                remQty,
                        per_share:                   srcPS,
                        issued_per_share:             srcPS,
                        issued_share_capital:         remQty * srcPS,
                        paidup_share_capital:         remQty * srcPS,
                        cash:                        remCash || null,
                        otherwise_cash:              remOC   || null,
                        no_consideration:            remNoC,
                        transactional_consideration: remNoC ? null : ((remCash + remOC) || null),
                        transferor_official_entity_id: src.official_entity_id,
                        transferor_no_of_shares:      remQty,
                        transferor_issued_capital:    remQty * srcPS,
                        transferor_paidup_capital:    remQty * srcPS,
                        old_share_id:                src.share_transaction_id,
                        old_share_class_id:          src.share_class_id || null,
                        old_currency:                src.currency        || null,
                        old_share_cert_no:           src.share_cert_no  || null,
                        old_data:                    cancelOldData,
                        is_retain:                   0,
                        is_ubo:                      0,
                        is_partially_paid:           0,
                        stamp_duty_payment:          0,
                        data_from:                   'MANUAL',
                        status:                      'VALID',
                        is_confirm:                  1,
                        is_deleted:                  0,
                        created_by:                  userId || null,
                        updated_by:                  userId || null,
                    };

                    const inTxn = await this.txnDao.create(inRow);
                    if (!inTxn) throw new Error(`Failed to create remaining cert for ${src.share_cert_no}`);
                    newInTxns.push(inTxn);

                    // Payments for remaining cert
                    if (!remNoC) {
                        const payBase = { entity_id, share_set_id, payment_date: cancel_date, is_deleted: 0, created_by: userId || null, updated_by: userId || null };
                        const payRows = [];
                        if (remCash > 0) payRows.push({ ...payBase, share_transaction_id: inTxn.share_transaction_id, payment_type: 'CASH',                cash: remCash, otherwise_cash: null, no_consideration: 0 });
                        if (remOC   > 0) payRows.push({ ...payBase, share_transaction_id: inTxn.share_transaction_id, payment_type: 'OTHERWISE_THAN_CASH', cash: null,    otherwise_cash: remOC, no_consideration: 0 });
                        if (payRows.length) await this.paymentDao.bulkCreate(payRows);
                    }
                }
            }

            // ── Invalidate all source transactions ────────────────────────────
            await this.txnDao.Model.update(
                { status: 'INVALID', updated_by: userId },
                { where: { share_transaction_id: { [Op.in]: sourceIds } } }
            );

            // Separate cancel keeps per_share unchanged, so company shares (entity_shares)
            // stay as-is — only the shareholder's holding changes. Only club cancel,
            // which can produce a new per_share, touches company shares.

            return responseHandler.returnSuccess(httpStatus.CREATED, 'Share cancellation saved successfully', {
                share_id:     shareHeader.share_id,
                share_set_id,
                in_txn_ids:   newInTxns.map(t => t.share_transaction_id),
            });

        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    createBuyback = async (body, userId) => {
        try {
            const models = getCurrentModels();
            const {
                entity_id, buyback_no, buyback_date, remarks,
                buyback_mode = 'separate',
                is_treasury = 0,
                stamp_duty = 0, stamp_duty_date, stamp_duty_amount,
                // club-mode fields
                club_buyback_shares,
                club_new_cert_no, club_new_folio_no,
                club_rem_cash, club_rem_oc, club_rem_no_consideration = 0,
                items = [],
            } = body;

            if (!entity_id)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'entity_id is required');
            if (!buyback_date)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Buyback date is required');
            if (!Array.isArray(items) || items.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'At least one item is required');

            // ── Load & validate source transactions ───────────────────────────
            const sourceIds = items.map(it => Number(it.source_txn_id));
            const sourceTxns = await this.txnDao.Model.findAll({
                where: {
                    share_transaction_id: { [Op.in]: sourceIds },
                    is_deleted:           0,
                    transaction_status:   { [Op.in]: ['IN', 'NONE'] },
                    status:               'VALID',
                },
                raw: true,
            });
            if (sourceTxns.length !== items.length)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'One or more source certificates are invalid or already used');

            const srcById = {};
            for (const t of sourceTxns) srcById[t.share_transaction_id] = t;

            // Separate-mode per-item validation only
            if (buyback_mode !== 'club') {
                for (const it of items) {
                    const src    = srcById[Number(it.source_txn_id)];
                    const buyQty = Number(it.no_of_shares_bought || 0);
                    if (buyQty <= 0 || buyQty > Number(src.no_of_shares || 0))
                        return responseHandler.returnError(httpStatus.BAD_REQUEST,
                            `Invalid buyback quantity for cert ${src.share_cert_no || src.share_transaction_id}`);
                    const remQty = Number(src.no_of_shares || 0) - buyQty;
                    if (remQty > 0 && !it.new_cert_no)
                        return responseHandler.returnError(httpStatus.BAD_REQUEST,
                            `New cert no. required for partial buyback of ${src.share_cert_no}`);
                }
            }

            const txType     = await models.transaction_type?.findOne({ where: { t_slug: 'buyback' } });
            const tx_type_id = txType?.t_id || 16;
            const share_set_id = uuidv4();

            // ── Snapshot entity_shares ────────────────────────────────────────
            const { snapshot: esSnap } = await buildSourceESContext(sourceTxns, models);

            // ── Share header ──────────────────────────────────────────────────
            const shareHeader = await this.shareDao.create({
                entity_id,
                transaction_type_id:       tx_type_id,
                extra_type_of_transaction: buyback_mode === 'club' ? 'CLUB_BUYBACK' : 'BUYBACK',
                transaction_date:          buyback_date,
                status:                    'VALID',
                source_from:               'MANUAL',
                share_set_id,
                remarks:                   remarks || null,
                created_by:                userId || null,
                updated_by:                userId || null,
            });
            if (!shareHeader) throw new Error('Failed to create buyback share header');

            const buybackOldData = {
                source_txn_ids:     sourceIds,
                buyback_type:       buyback_mode,
                is_treasury:        Number(is_treasury) ? 1 : 0,
                source_es_snapshot: buildESSnapshotForOldData(esSnap),
                buyback_es_ids:     [],
            };

            // ═══════════════════════════════════════════════════════════════════
            // ── CLUB BUYBACK path ───────────────────────────────────────────────
            // ═══════════════════════════════════════════════════════════════════
            if (buyback_mode === 'club') {
                const firstSrc    = sourceTxns[0];
                const totalShares = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
                const totalPaidup = sourceTxns.reduce((s, t) => s + Number(t.paidup_share_capital || 0), 0);
                const clubPS      = totalShares > 0 ? totalPaidup / totalShares : 0;
                const buyQty      = Number(club_buyback_shares || 0);
                const balQty      = totalShares - buyQty;

                if (buyQty <= 0 || buyQty > totalShares)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, `Invalid club buyback quantity (pool has ${totalShares} shares)`);
                if (balQty > 0 && !club_new_cert_no)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, 'New cert no. required when shares remain after club buyback');

                const txnBase = {
                    share_id: shareHeader.share_id, share_set_id, entity_id,
                    currency: firstSrc.currency, share_class_id: firstSrc.share_class_id,
                    share_type: firstSrc.share_type, transaction_no: buyback_no || null,
                    official_type: firstSrc.official_type, official_entity_id: firstSrc.official_entity_id,
                    folio_no: firstSrc.folio_no || null,
                    is_retain: 0, is_ubo: 0, is_partially_paid: 0,
                    stamp_duty_payment: stamp_duty ? 1 : 0,
                    stamp_duty_payment_date:   stamp_duty ? (stamp_duty_date   || null) : null,
                    stamp_duty_payment_amount: stamp_duty ? (stamp_duty_amount || null) : null,
                    data_from: 'MANUAL', status: 'VALID', is_confirm: 1, is_deleted: 0,
                    created_by: userId || null, updated_by: userId || null,
                    old_data: buybackOldData,
                };

                // ── OUT row for bought-back pool ──────────────────────────────
                await this.txnDao.create({
                    ...txnBase,
                    company_share_id:     firstSrc.company_share_id,
                    transaction_status:   'OUT',
                    share_cert_no:        null,
                    no_of_shares:         buyQty,
                    per_share:            clubPS,
                    issued_per_share:     clubPS,
                    issued_share_capital: buyQty * clubPS,
                    paidup_share_capital: buyQty * clubPS,
                    old_share_id:         sourceIds[0],
                });

                // ── Balance cert IN row (when partial) ────────────────────────
                const newInTxns = [];
                if (balQty > 0) {
                    const newES = await createEntityShareEntry({
                        models, entity_id,
                        currency: firstSrc.currency, share_class_id: firstSrc.share_class_id,
                        share_type: firstSrc.share_type || 'NORMAL',
                        date: buyback_date, txnType: 'club_buyback', userId,
                        shares: balQty, issued: balQty * clubPS, paidup: balQty * clubPS,
                        perShare: clubPS, remarks: 'Created by club buyback (balance)',
                    });
                    buybackOldData.buyback_es_ids.push(newES.id);

                    const remCashV = club_rem_no_consideration ? 0 : Number(club_rem_cash || 0);
                    const remOCV   = club_rem_no_consideration ? 0 : Number(club_rem_oc   || 0);
                    const remNoC   = club_rem_no_consideration ? 1 : 0;

                    const inTxn = await this.txnDao.create({
                        ...txnBase,
                        company_share_id:     newES.id,
                        transaction_status:   'IN',
                        folio_no:             club_new_folio_no || firstSrc.folio_no || null,
                        share_cert_no:        club_new_cert_no || null,
                        no_of_shares:         balQty,
                        per_share:            clubPS,
                        issued_per_share:     clubPS,
                        issued_share_capital: balQty * clubPS,
                        paidup_share_capital: balQty * clubPS,
                        cash:                 remCashV || null,
                        otherwise_cash:       remOCV   || null,
                        no_consideration:     remNoC,
                        transactional_consideration: remNoC ? null : ((remCashV + remOCV) || null),
                        transferor_official_entity_id: firstSrc.official_entity_id,
                        transferor_no_of_shares:  balQty,
                        transferor_issued_capital: balQty * clubPS,
                        transferor_paidup_capital: balQty * clubPS,
                        old_share_id: sourceIds[0],
                    });
                    if (!inTxn) throw new Error('Failed to create club buyback balance cert');
                    newInTxns.push(inTxn);

                    if (!remNoC) {
                        const pb = { entity_id, share_set_id, payment_date: buyback_date, is_deleted: 0, created_by: userId || null, updated_by: userId || null };
                        const pr = [];
                        if (remCashV > 0) pr.push({ ...pb, share_transaction_id: inTxn.share_transaction_id, payment_type: 'CASH',                cash: remCashV, otherwise_cash: null,    no_consideration: 0 });
                        if (remOCV   > 0) pr.push({ ...pb, share_transaction_id: inTxn.share_transaction_id, payment_type: 'OTHERWISE_THAN_CASH', cash: null,     otherwise_cash: remOCV, no_consideration: 0 });
                        if (pr.length) await this.paymentDao.bulkCreate(pr);
                    }
                }

                // ── Invalidate all source txns ────────────────────────────────
                await this.txnDao.Model.update(
                    { status: 'INVALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: sourceIds } } }
                );

                // ── Reduce all source entity_shares (full amounts, always affects company) ──
                const sourceByCSId = {};
                for (const t of sourceTxns) {
                    const csId = String(t.company_share_id);
                    const qty  = Number(t.no_of_shares || 0);
                    const ps   = Number(t.per_share || 0);
                    if (!sourceByCSId[csId]) sourceByCSId[csId] = { shares: 0, issued: 0, paidup: 0 };
                    sourceByCSId[csId].shares += qty;
                    sourceByCSId[csId].issued += qty * ps;
                    sourceByCSId[csId].paidup += qty * ps;
                }
                await reduceEntityShares({ snapshot: esSnap, reductionMap: sourceByCSId, userId, models });

                return responseHandler.returnSuccess(httpStatus.CREATED, 'Share buyback (club) saved successfully', {
                    share_id:     shareHeader.share_id,
                    share_set_id,
                    in_txn_ids:   newInTxns.map(t => t.share_transaction_id),
                });
            }

            // ═══════════════════════════════════════════════════════════════════
            // ── SEPARATE BUYBACK path ───────────────────────────────────────────
            // ═══════════════════════════════════════════════════════════════════

            const newInTxns = [];
            const reductionMap = {};

            for (const it of items) {
                const src    = srcById[Number(it.source_txn_id)];
                const buyQty = Number(it.no_of_shares_bought);
                const srcPS  = Number(src.per_share || 0);
                const remQty = Number(src.no_of_shares || 0) - buyQty;

                const txnBase = {
                    share_id:           shareHeader.share_id,
                    share_set_id,
                    company_share_id:   src.company_share_id,
                    entity_id,
                    currency:           src.currency,
                    share_class_id:     src.share_class_id,
                    share_type:         src.share_type,
                    transaction_no:     buyback_no || null,
                    official_type:      src.official_type,
                    official_entity_id: src.official_entity_id,
                    folio_no:           src.folio_no || null,
                    per_share:          srcPS,
                    issued_per_share:   srcPS,
                    is_retain:          0, is_ubo: 0, is_partially_paid: 0,
                    data_from:          'MANUAL',
                    status:             'VALID',
                    is_confirm:         1, is_deleted: 0,
                    created_by:         userId || null, updated_by: userId || null,
                    old_data:           buybackOldData,
                };

                // ── OUT row (bought-back shares) ──────────────────────────────
                await this.txnDao.create({
                    ...txnBase,
                    transaction_status:   'OUT',
                    share_cert_no:        src.share_cert_no || null,
                    no_of_shares:         buyQty,
                    issued_share_capital: buyQty * srcPS,
                    paidup_share_capital: buyQty * srcPS,
                    stamp_duty_payment:        stamp_duty ? 1 : 0,
                    stamp_duty_payment_date:   stamp_duty ? (stamp_duty_date || null) : null,
                    stamp_duty_payment_amount: stamp_duty ? (stamp_duty_amount || null) : null,
                    old_share_id:         src.share_transaction_id,
                    old_share_cert_no:    src.share_cert_no || null,
                });

                // ── IN row for remaining cert (partial buyback) ───────────────
                if (remQty > 0) {
                    const remCash = it.rem_no_consideration ? 0 : Number(it.rem_cash || 0);
                    const remOC   = it.rem_no_consideration ? 0 : Number(it.rem_oc   || 0);
                    const remNoC  = it.rem_no_consideration ? 1 : 0;

                    const inTxn = await this.txnDao.create({
                        ...txnBase,
                        transaction_status:   'IN',
                        share_cert_no:        it.new_cert_no || null,
                        folio_no:             it.new_folio_no || src.folio_no || null,
                        no_of_shares:         remQty,
                        issued_share_capital: remQty * srcPS,
                        paidup_share_capital: remQty * srcPS,
                        cash:                 remCash || null,
                        otherwise_cash:       remOC   || null,
                        no_consideration:     remNoC,
                        transactional_consideration: remNoC ? null : ((remCash + remOC) || null),
                        transferor_official_entity_id: src.official_entity_id,
                        transferor_no_of_shares:       remQty,
                        transferor_issued_capital:     remQty * srcPS,
                        transferor_paidup_capital:     remQty * srcPS,
                        stamp_duty_payment:   0,
                        old_share_id:         src.share_transaction_id,
                        old_share_cert_no:    src.share_cert_no || null,
                    });
                    if (!inTxn) throw new Error(`Failed to create remaining cert for ${src.share_cert_no}`);
                    newInTxns.push(inTxn);

                    if (!remNoC) {
                        const pb = { entity_id, share_set_id, payment_date: buyback_date, is_deleted: 0, created_by: userId || null, updated_by: userId || null };
                        const pr = [];
                        if (remCash > 0) pr.push({ ...pb, share_transaction_id: inTxn.share_transaction_id, payment_type: 'CASH',                cash: remCash, otherwise_cash: null, no_consideration: 0 });
                        if (remOC   > 0) pr.push({ ...pb, share_transaction_id: inTxn.share_transaction_id, payment_type: 'OTHERWISE_THAN_CASH', cash: null,    otherwise_cash: remOC, no_consideration: 0 });
                        if (pr.length) await this.paymentDao.bulkCreate(pr);
                    }
                }

                // Accumulate reduction amounts
                if (!Number(is_treasury)) {
                    const csId = String(src.company_share_id);
                    if (!reductionMap[csId]) reductionMap[csId] = { shares: 0, issued: 0, paidup: 0 };
                    reductionMap[csId].shares += buyQty;
                    reductionMap[csId].issued += buyQty * srcPS;
                    reductionMap[csId].paidup += buyQty * srcPS;
                }
            }

            // ── Invalidate source transactions ────────────────────────────────
            await this.txnDao.Model.update(
                { status: 'INVALID', updated_by: userId },
                { where: { share_transaction_id: { [Op.in]: sourceIds } } }
            );

            // ── Reduce entity_shares (skipped for treasury buyback) ───────────
            if (!Number(is_treasury) && Object.keys(reductionMap).length) {
                await reduceEntityShares({ snapshot: esSnap, reductionMap, userId, models });
            }

            return responseHandler.returnSuccess(httpStatus.CREATED, 'Share buyback saved successfully', {
                share_id:     shareHeader.share_id,
                share_set_id,
                in_txn_ids:   newInTxns.map(t => t.share_transaction_id),
            });

        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── RETAIN BUYBACK (reverse a buyback) ───────────────────────────────────

    retainBuyback = async (txn_id, userId) => {
        try {
            const models = getCurrentModels();
            const txn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: txn_id, is_deleted: 0 },
                raw: true,
            });
            if (!txn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transaction not found');
            if (txn.status !== 'VALID')
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only VALID transactions can be retained');

            const shareHeader = await this.shareDao.Model.findOne({ where: { share_id: txn.share_id }, raw: true });
            if (!shareHeader || !['BUYBACK', 'CLUB_BUYBACK'].includes(shareHeader.extra_type_of_transaction))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only buyback transactions can be retained here');

            const oldData   = txn.old_data;
            const sourceIds = oldData?.source_txn_ids;
            if (!Array.isArray(sourceIds) || sourceIds.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source certificate references not found');

            // Find all IN rows for this buyback (remaining certs)
            const allInTxns = await this.txnDao.Model.findAll({
                where: { share_id: txn.share_id, transaction_status: 'IN', is_deleted: 0 },
                raw: true,
            });

            // Guard: remaining cert must not have been re-used
            for (const inTxn of allInTxns) {
                const furtherUse = await this.txnDao.Model.findOne({
                    where: { old_share_id: inTxn.share_transaction_id, is_deleted: 0, status: 'VALID' },
                    raw: true,
                });
                if (furtherUse)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cannot retain: the remaining certificate has already been used in another transaction');
            }

            const inTxnIds = allInTxns.map(t => t.share_transaction_id);

            await Promise.all([
                // Restore source transactions to VALID
                this.txnDao.Model.update(
                    { status: 'VALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: sourceIds.map(Number) } } }
                ),
                // Invalidate all OUT rows for this buyback
                this.txnDao.Model.update(
                    { status: 'INVALID', updated_by: userId },
                    { where: { share_id: txn.share_id, transaction_status: 'OUT', is_deleted: 0 } }
                ),
                // Invalidate IN (remaining cert) rows
                ...(inTxnIds.length ? [
                    this.txnDao.Model.update(
                        { status: 'INVALID', updated_by: userId },
                        { where: { share_transaction_id: { [Op.in]: inTxnIds } } }
                    ),
                    this.paymentDao.Model.update(
                        { is_deleted: 1, updated_by: userId },
                        { where: { share_transaction_id: { [Op.in]: inTxnIds } } }
                    ),
                ] : []),
                // Soft-delete ledger rows
                this.ledgerDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_id: txn.share_id } }
                ),
                // Soft-delete share header
                this.shareDao.updateWhere(
                    { is_deleted: 1, updated_by: userId },
                    { share_id: txn.share_id }
                ),
            ]);

            // Restore entity_shares for non-treasury buybacks
            if (!oldData?.is_treasury) {
                const buybackEsIds = oldData?.buyback_es_ids || [];
                if (buybackEsIds.length > 0) {
                    await deleteEntityShares(buybackEsIds, userId, models);
                }
                if (oldData?.source_es_snapshot) {
                    await restoreEntitySharesSnapshot(oldData.source_es_snapshot, userId, models);
                }
            }

            return responseHandler.returnSuccess(httpStatus.OK, 'Buyback retained (reversed) successfully');
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── CREATE REPLACEMENT (lost share cert) ────────────────────────────────────
    //
    // Replaces a lost share certificate with a new cert number.
    // - "new"      mode: source → INVALID; OUT row; IN row with new cert no.
    // - "existing" mode: source + existing cert → INVALID; OUT rows for both;
    //                    IN row for combined shares; new entity_shares entry.
    //
    // body: { entity_id, source_txn_id, replacement_no, replacement_date,
    //         remarks, new_cert_no, new_folio_no }

    createReplacement = async (body, userId) => {
        try {
            const models = getCurrentModels();
            const {
                entity_id, source_txn_id,
                replacement_no, replacement_date, remarks,
                new_cert_no, new_folio_no,
            } = body;

            if (!entity_id)       return responseHandler.returnError(httpStatus.BAD_REQUEST, 'entity_id is required');
            if (!replacement_date) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Replacement date is required');
            if (!source_txn_id)   return responseHandler.returnError(httpStatus.BAD_REQUEST, 'source_txn_id is required');
            if (!new_cert_no)     return responseHandler.returnError(httpStatus.BAD_REQUEST, 'New cert no. is required');

            // ── Fetch & validate source txn ───────────────────────────────────
            const sourceTxn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: Number(source_txn_id), is_deleted: 0, status: 'VALID', transaction_status: { [Op.in]: ['IN', 'NONE'] } },
                raw: true,
            });
            if (!sourceTxn) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source certificate not found or already used');

            // ── Check if new_cert_no already exists for this entity ───────────
            // A cert no. can have several lines (one per per_share, e.g. after a combine);
            // prefer the line whose per_share matches the source so it can be combined.
            const existingLines = await this.txnDao.Model.findAll({
                where: {
                    entity_id,
                    share_cert_no:      new_cert_no,
                    status:             'VALID',
                    transaction_status: { [Op.in]: ['IN', 'NONE'] },
                    is_deleted:         0,
                    share_transaction_id: { [Op.ne]: sourceTxn.share_transaction_id },
                },
                raw: true,
            });
            const existingCert = existingLines.find(l => Number(l.per_share) === Number(sourceTxn.per_share))
                || existingLines[0] || null;

            // ── Validate compatibility when combining with existing ────────────
            // If per_share differs: treat as fresh cert (don't touch existing, don't combine)
            const canCombine = existingCert && Number(existingCert.per_share) === Number(sourceTxn.per_share);
            if (canCombine) {
                if (existingCert.share_class_id !== sourceTxn.share_class_id)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, `Existing cert "${new_cert_no}" belongs to a different share class — cannot combine`);
                if (existingCert.share_type !== sourceTxn.share_type)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, `Existing cert "${new_cert_no}" has a different share type — cannot combine`);
                if (existingCert.currency !== sourceTxn.currency)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, `Existing cert "${new_cert_no}" has a different currency — cannot combine`);
                if (existingCert.official_entity_id !== sourceTxn.official_entity_id)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, `Existing cert "${new_cert_no}" belongs to a different shareholder — cannot combine`);
            }

            const txType     = await models.transaction_type?.findOne({ where: { t_slug: 'replace-lost-share-cert' } });
            const tx_type_id = txType?.t_id || 6;
            const share_set_id = uuidv4();

            const srcQty = Number(sourceTxn.no_of_shares || 0);
            const srcPS  = Number(sourceTxn.per_share || 0);

            // Replacement never changes the company share pool (no net capital change)

            // ── Create share header ───────────────────────────────────────────
            const shareHeader = await this.shareDao.create({
                entity_id,
                transaction_type_id:       tx_type_id,
                extra_type_of_transaction: canCombine ? 'REPLACEMENT_COMBINE' : 'REPLACEMENT',
                transaction_date:          replacement_date,
                status:                    'VALID',
                source_from:               'MANUAL',
                share_set_id,
                remarks:                   remarks || null,
                created_by:                userId || null,
                updated_by:                userId || null,
            });
            if (!shareHeader) throw new Error('Failed to create replacement share header');

            const allSourceIds = [sourceTxn.share_transaction_id, ...(canCombine ? [existingCert.share_transaction_id] : [])];
            const replOldData = {
                source_txn_ids:      allSourceIds,
                replace_type:        existingCert ? 'existing' : 'new',
            };

            const txnBase = {
                share_id:           shareHeader.share_id,
                share_set_id,
                entity_id,
                currency:           sourceTxn.currency,
                share_class_id:     sourceTxn.share_class_id,
                share_type:         sourceTxn.share_type,
                official_type:      sourceTxn.official_type,
                official_entity_id: sourceTxn.official_entity_id,
                transaction_no:     replacement_no || null,
                folio_no:           new_folio_no || sourceTxn.folio_no || null,
                per_share:          srcPS,
                issued_per_share:   srcPS,
                is_retain:          0, is_ubo: 0, is_partially_paid: 0,
                stamp_duty_payment: 0,
                data_from:          'MANUAL', status: 'VALID', is_confirm: 1, is_deleted: 0,
                created_by:         userId || null, updated_by: userId || null,
                old_data:           replOldData,
            };

            // ── Invalidate source cert ────────────────────────────────────────
            await this.txnDao.Model.update(
                { status: 'INVALID', updated_by: userId },
                { where: { share_transaction_id: sourceTxn.share_transaction_id } }
            );

            // ── OUT row for source cert ───────────────────────────────────────
            await this.txnDao.create({
                ...txnBase,
                company_share_id:     sourceTxn.company_share_id,
                transaction_status:   'OUT',
                share_cert_no:        sourceTxn.share_cert_no || null,
                no_of_shares:         srcQty,
                issued_share_capital: srcQty * srcPS,
                paidup_share_capital: srcQty * srcPS,
                no_consideration:     1,
                transactional_consideration: null,
                old_share_id:         sourceTxn.share_transaction_id,
                old_share_cert_no:    sourceTxn.share_cert_no || null,
            });

            let combinedQty = srcQty;
            let newESId;

            if (canCombine) {
                // ── Combine mode: merge two certs, no pool change (same per_share = same pool) ──
                const exQty = Number(existingCert.no_of_shares || 0);
                const exPS  = Number(existingCert.per_share || 0);

                await this.txnDao.Model.update(
                    { status: 'INVALID', updated_by: userId },
                    { where: { share_transaction_id: existingCert.share_transaction_id } }
                );
                await this.txnDao.create({
                    ...txnBase,
                    company_share_id:     existingCert.company_share_id,
                    transaction_status:   'OUT',
                    share_cert_no:        existingCert.share_cert_no || null,
                    no_of_shares:         exQty,
                    issued_share_capital: exQty * exPS,
                    paidup_share_capital: exQty * exPS,
                    no_consideration:     1,
                    transactional_consideration: null,
                    old_share_id:         existingCert.share_transaction_id,
                    old_share_cert_no:    existingCert.share_cert_no || null,
                });

                combinedQty = srcQty + exQty;
            }

            // Both simple and combine reuse the source pool — replacement is cert-level only
            newESId = sourceTxn.company_share_id;

            // ── IN row for replacement cert ───────────────────────────────────
            await this.txnDao.create({
                ...txnBase,
                company_share_id:         newESId,
                transaction_status:       'IN',
                share_cert_no:            new_cert_no,
                no_of_shares:             combinedQty,
                issued_share_capital:     combinedQty * srcPS,
                paidup_share_capital:     combinedQty * srcPS,
                no_consideration:         0,
                cash:                     combinedQty * srcPS,
                transactional_consideration: combinedQty * srcPS,
                consideration_description:'Replacement for lost share certificate',
                old_share_id:             sourceTxn.share_transaction_id,
                old_share_cert_no:        sourceTxn.share_cert_no || null,
                transferor_official_entity_id: sourceTxn.official_entity_id,
                transferor_no_of_shares:       combinedQty,
                transferor_issued_capital:     combinedQty * srcPS,
                transferor_paidup_capital:     combinedQty * srcPS,
            });

            // ── Auto-record payment: shares were already paid on the original cert ──
            const inTxn = await this.txnDao.Model.findOne({
                where: { share_id: shareHeader.share_id, transaction_status: 'IN', is_deleted: 0 },
                raw: true,
            });
            if (inTxn && combinedQty * srcPS > 0) {
                await this.paymentDao.create({
                    entity_id,
                    share_transaction_id:      inTxn.share_transaction_id,
                    share_set_id,
                    payment_type:              'CASH',
                    cash:                      combinedQty * srcPS,
                    otherwise_cash:            null,
                    no_consideration:          0,
                    consideration_description: 'Previously paid on original certificate',
                    payment_date:              replacement_date,
                    is_deleted:                0,
                    created_by:                userId || null,
                    updated_by:                userId || null,
                });
            }

            return responseHandler.returnSuccess(httpStatus.CREATED, 'Replacement saved successfully', {
                share_id: shareHeader.share_id,
                share_set_id,
                combined: !!existingCert,
                combined_qty: combinedQty,
            });
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── RETAIN REPLACEMENT ───────────────────────────────────────────────────────

    retainReplacement = async (txn_id, userId) => {
        try {
            const models = getCurrentModels();
            const txn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: txn_id, is_deleted: 0 },
                raw: true,
            });
            if (!txn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transaction not found');
            if (txn.status !== 'VALID')
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only VALID transactions can be retained');

            const shareHeader = await this.shareDao.Model.findOne({ where: { share_id: txn.share_id }, raw: true });
            if (!shareHeader || !['REPLACEMENT', 'REPLACEMENT_COMBINE'].includes(shareHeader.extra_type_of_transaction))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only replacement transactions can be retained here');

            const oldData   = txn.old_data;
            const sourceIds = oldData?.source_txn_ids;
            if (!Array.isArray(sourceIds) || sourceIds.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source certificate references not found');

            // Guard: replacement cert must not have been re-used
            const allInTxns = await this.txnDao.Model.findAll({
                where: { share_id: txn.share_id, transaction_status: 'IN', is_deleted: 0 },
                raw: true,
            });
            for (const inTxn of allInTxns) {
                const furtherUse = await this.txnDao.Model.findOne({
                    where: { old_share_id: inTxn.share_transaction_id, is_deleted: 0, status: 'VALID' },
                    raw: true,
                });
                if (furtherUse)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cannot retain: the replacement certificate has already been used in another transaction');
            }

            const inTxnIds = allInTxns.map(t => t.share_transaction_id);

            await Promise.all([
                // Restore all source certs to VALID (original cert + existing cert if combine mode)
                this.txnDao.Model.update(
                    { status: 'VALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: sourceIds.map(Number) } } }
                ),
                // Invalidate all OUT rows
                this.txnDao.Model.update(
                    { status: 'INVALID', updated_by: userId },
                    { where: { share_id: txn.share_id, transaction_status: 'OUT', is_deleted: 0 } }
                ),
                // Invalidate IN (replacement cert) rows
                ...(inTxnIds.length ? [
                    this.txnDao.Model.update(
                        { status: 'INVALID', updated_by: userId },
                        { where: { share_transaction_id: { [Op.in]: inTxnIds } } }
                    ),
                ] : []),
                // Soft-delete ledger rows
                this.ledgerDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_id: txn.share_id } }
                ),
                // Soft-delete share header
                this.shareDao.updateWhere(
                    { is_deleted: 1, updated_by: userId },
                    { share_id: txn.share_id }
                ),
            ]);

            // Restore entity_shares
            const replaceEsIds = oldData?.replace_es_ids || [];
            if (replaceEsIds.length > 0) {
                await deleteEntityShares(replaceEsIds, userId, models);
            }
            if (oldData?.source_es_snapshot) {
                await restoreEntitySharesSnapshot(oldData.source_es_snapshot, userId, models);
            }

            return responseHandler.returnSuccess(httpStatus.OK, 'Replacement retained (reversed) successfully');
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── CREATE SPLIT (split share cert) ──────────────────────────────────────────
    //
    // Splits share certificate(s) into two or more new certs for the SAME holder.
    // split_mode 'separate' — one source cert; same per_share, same company_share_id.
    //                          entity_shares untouched (only the holder's certs change).
    // split_mode 'club'     — several source certs are pooled at a weighted-average
    //                          per_share, so the source entity_shares pools are reduced
    //                          and one new pool is created for the split certs.
    // Both: sources → INVALID with an OUT row each; one IN row per new cert.
    //
    // body: { entity_id, source_txn_ids, split_mode, split_no, split_date, remarks,
    //         splits: [{ cert_no, folio_no?, no_of_shares, distinctive_from?, distinctive_to? }] }

    createSplit = async (body, userId) => {
        try {
            const models = getCurrentModels();
            const {
                entity_id, split_no, split_date, remarks,
                split_mode = 'separate',
                splits = [],
            } = body;
            const sourceIds = (Array.isArray(body.source_txn_ids) ? body.source_txn_ids : [body.source_txn_id])
                .filter(Boolean).map(Number);
            const isClub = split_mode === 'club';

            if (!entity_id)  return responseHandler.returnError(httpStatus.BAD_REQUEST, 'entity_id is required');
            if (!split_date) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Split date is required');
            if (isClub ? sourceIds.length < 2 : sourceIds.length !== 1)
                return responseHandler.returnError(httpStatus.BAD_REQUEST,
                    isClub ? 'Club split needs at least two source certificates' : 'Select exactly one source certificate');
            if (!Array.isArray(splits) || splits.length < 2)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'At least two new certificates are required');

            // ── Fetch & validate source txns ──────────────────────────────────
            const sourceTxns = await this.txnDao.Model.findAll({
                where: { share_transaction_id: { [Op.in]: sourceIds }, is_deleted: 0, status: 'VALID', transaction_status: { [Op.in]: ['IN', 'NONE'] } },
                raw: true,
            });
            if (sourceTxns.length !== sourceIds.length)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'One or more source certificates are invalid or already used');

            const firstSrc = sourceTxns[0];
            const sameAs = (f) => sourceTxns.every(t => String(t[f]) === String(firstSrc[f]));
            if (!sameAs('official_entity_id'))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'All source certificates must belong to the same shareholder');
            if (!sameAs('share_class_id') || !sameAs('currency') || !sameAs('share_type'))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'All source certificates must have the same currency, share class and share type');

            const srcQty    = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares         || 0), 0);
            const srcIssued = sourceTxns.reduce((s, t) => s + Number(t.issued_share_capital || 0), 0);
            const srcPaidup = sourceTxns.reduce((s, t) => s + Number(t.paidup_share_capital || 0), 0);

            // ── Validate split rows ───────────────────────────────────────────
            const certNos = [];
            let totalQty  = 0;
            for (let i = 0; i < splits.length; i++) {
                const certNo = String(splits[i].cert_no || '').trim();
                const qty    = Number(splits[i].no_of_shares || 0);
                if (!certNo)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, `Cert #${i + 1}: cert no. is required`);
                if (!(qty > 0))
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, `Cert ${certNo}: no. of shares must be greater than 0`);
                if (certNos.includes(certNo.toLowerCase()))
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, `Cert no. "${certNo}" is used more than once`);
                certNos.push(certNo.toLowerCase());
                totalQty += qty;
            }
            if (Math.abs(totalQty - srcQty) > 0.0001)
                return responseHandler.returnError(httpStatus.BAD_REQUEST,
                    `Total of new certs (${totalQty}) must equal source shares (${srcQty})`);

            // New cert nos must not clash with an active cert (sources excluded — they are invalidated)
            const clash = await this.txnDao.Model.findOne({
                where: {
                    entity_id,
                    share_cert_no:        { [Op.in]: splits.map(s => String(s.cert_no).trim()) },
                    status:               'VALID',
                    transaction_status:   { [Op.in]: ['IN', 'NONE'] },
                    is_deleted:           0,
                    share_transaction_id: { [Op.notIn]: sourceIds },
                },
                raw: true,
            });
            if (clash)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, `Cert no. "${clash.share_cert_no}" is already in use`);

            const txType     = await models.transaction_type?.findOne({ where: { t_slug: 'split-share-cert' } });
            const tx_type_id = txType?.t_id || 7;
            const share_set_id = uuidv4();

            // Separate: source per_share as-is. Club: weighted average over the pool.
            const issuedPS = srcQty > 0 ? srcIssued / srcQty : Number(firstSrc.per_share || 0);
            const paidPS   = srcQty > 0 ? srcPaidup / srcQty : Number(firstSrc.per_share || 0);
            const newPS    = isClub ? paidPS : Number(firstSrc.per_share || 0);

            // ── Club: snapshot source pools and create the new weighted pool ──
            let esSnap = [];
            let reductionMap = {};
            const splitEsIds = [];
            let inCompanyShareId = firstSrc.company_share_id;
            if (isClub) {
                ({ snapshot: esSnap, reductionMap } = await buildSourceESContext(sourceTxns, models));
                const newES = await createEntityShareEntry({
                    models, entity_id,
                    currency:       firstSrc.currency,
                    share_class_id: firstSrc.share_class_id,
                    share_type:     firstSrc.share_type || 'NORMAL',
                    date:           split_date,
                    txnType:        'club_split',
                    userId,
                    shares:         srcQty,
                    issued:         srcIssued,
                    paidup:         srcPaidup,
                    perShare:       paidPS,
                    issuedPerShare: issuedPS,
                    remarks:        'Created by club split',
                });
                splitEsIds.push(newES.id);
                inCompanyShareId = newES.id;
            }

            // ── Create share header ───────────────────────────────────────────
            const shareHeader = await this.shareDao.create({
                entity_id,
                transaction_type_id:       tx_type_id,
                extra_type_of_transaction: isClub ? 'CLUB_SPLIT' : 'SPLIT',
                transaction_date:          split_date,
                status:                    'VALID',
                source_from:               'MANUAL',
                share_set_id,
                remarks:                   remarks || null,
                created_by:                userId || null,
                updated_by:                userId || null,
            });
            if (!shareHeader) throw new Error('Failed to create split share header');

            const splitOldData = {
                source_txn_ids:     sourceIds,
                split_type:         split_mode,
                split_es_ids:       splitEsIds,
                source_es_snapshot: buildESSnapshotForOldData(esSnap),
            };

            const txnBase = {
                share_id:           shareHeader.share_id,
                share_set_id,
                entity_id,
                currency:           firstSrc.currency,
                share_class_id:     firstSrc.share_class_id,
                share_type:         firstSrc.share_type,
                official_type:      firstSrc.official_type,
                official_entity_id: firstSrc.official_entity_id,
                transaction_no:     split_no || null,
                old_share_class_id: firstSrc.share_class_id || null,
                old_currency:       firstSrc.currency       || null,
                old_data:           splitOldData,
                is_retain:          0, is_ubo: 0, is_partially_paid: 0,
                stamp_duty_payment: 0,
                data_from:          'MANUAL', status: 'VALID', is_confirm: 1, is_deleted: 0,
                created_by:         userId || null, updated_by: userId || null,
            };

            // ── Invalidate source certs ───────────────────────────────────────
            await this.txnDao.Model.update(
                { status: 'INVALID', updated_by: userId },
                { where: { share_transaction_id: { [Op.in]: sourceIds } } }
            );

            // ── OUT row per source cert ───────────────────────────────────────
            for (const src of sourceTxns) {
                await this.txnDao.create({
                    ...txnBase,
                    company_share_id:     src.company_share_id,
                    transaction_status:   'OUT',
                    folio_no:             src.folio_no || null,
                    share_cert_no:        src.share_cert_no || null,
                    no_of_shares:         src.no_of_shares,
                    per_share:            src.per_share,
                    issued_per_share:     src.issued_per_share ?? src.per_share,
                    issued_share_capital: src.issued_share_capital,
                    paidup_share_capital: src.paidup_share_capital,
                    no_consideration:     1,
                    transactional_consideration: null,
                    old_share_id:         src.share_transaction_id,
                    old_share_cert_no:    src.share_cert_no || null,
                });
            }

            // ── IN row per new cert ───────────────────────────────────────────
            const inTxns = [];
            for (const s of splits) {
                const qty    = Number(s.no_of_shares);
                const issued = qty * issuedPS;
                const paidup = qty * paidPS;

                const inTxn = await this.txnDao.create({
                    ...txnBase,
                    company_share_id:     inCompanyShareId,
                    transaction_status:   'IN',
                    folio_no:             String(s.folio_no || '').trim() || firstSrc.folio_no || null,
                    share_cert_no:        String(s.cert_no).trim(),
                    no_of_shares:         qty,
                    per_share:            newPS,
                    issued_per_share:     isClub ? issuedPS : (firstSrc.issued_per_share ?? issuedPS),
                    issued_share_capital: issued,
                    paidup_share_capital: paidup,
                    no_consideration:     0,
                    cash:                 paidup || null,
                    transactional_consideration: paidup || null,
                    transferor_official_entity_id: firstSrc.official_entity_id,
                    transferor_no_of_shares:       qty,
                    transferor_issued_capital:     issued,
                    transferor_paidup_capital:     paidup,
                    old_share_id:         firstSrc.share_transaction_id,
                    old_share_cert_no:    firstSrc.share_cert_no || null,
                });
                if (!inTxn) throw new Error(`Failed to create split cert ${s.cert_no}`);
                inTxns.push(inTxn);
            }

            // ── Club: shrink / soft-delete the source pools ──────────────────
            if (isClub) {
                await reduceEntityShares({ snapshot: esSnap, reductionMap, userId, models });
            }

            // ── Auto-record payments: shares were already paid on the original cert(s) ──
            const payRows = inTxns
                .filter(t => Number(t.paidup_share_capital) > 0)
                .map(t => ({
                    entity_id,
                    share_transaction_id:      t.share_transaction_id,
                    share_set_id,
                    payment_type:              'CASH',
                    cash:                      t.paidup_share_capital,
                    otherwise_cash:            null,
                    no_consideration:          0,
                    consideration_description: 'Previously paid on original certificate',
                    payment_date:              split_date,
                    is_deleted:                0,
                    created_by:                userId || null,
                    updated_by:                userId || null,
                }));
            if (payRows.length) await this.paymentDao.bulkCreate(payRows);

            // ── cs_share_distinctive ─────────────────────────────────────────
            if (models.share_distinctive) {
                const distinctiveRows = splits
                    .map((s, i) => ({ s, t: inTxns[i] }))
                    .filter(({ s }) => s.distinctive_from || s.distinctive_to)
                    .map(({ s, t }) => ({
                        entity_id,
                        share_transaction_id: t.share_transaction_id,
                        share_set_id,
                        share_cert_no:    t.share_cert_no,
                        distinctive_from: s.distinctive_from || null,
                        distinctive_to:   s.distinctive_to   || null,
                        no_of_shares:     t.no_of_shares,
                        is_deleted:       0,
                        created_by:       userId || null,
                        updated_by:       userId || null,
                    }));
                if (distinctiveRows.length) await models.share_distinctive.bulkCreate(distinctiveRows);
            }

            return responseHandler.returnSuccess(httpStatus.CREATED, `${isClub ? 'Club split' : 'Split'} saved successfully`, {
                share_id:   shareHeader.share_id,
                share_set_id,
                in_txn_ids: inTxns.map(t => t.share_transaction_id),
            });
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── RETAIN SPLIT ─────────────────────────────────────────────────────────────

    retainSplit = async (txn_id, userId) => {
        try {
            const models = getCurrentModels();
            const txn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: txn_id, is_deleted: 0 },
                raw: true,
            });
            if (!txn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transaction not found');
            if (txn.status !== 'VALID')
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only VALID transactions can be retained');

            const shareHeader = await this.shareDao.Model.findOne({ where: { share_id: txn.share_id }, raw: true });
            if (!shareHeader || !['SPLIT', 'CLUB_SPLIT'].includes(shareHeader.extra_type_of_transaction))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only split transactions can be retained here');

            const oldData   = txn.old_data;
            const sourceIds = oldData?.source_txn_ids;
            if (!Array.isArray(sourceIds) || sourceIds.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source certificate references not found');

            // Guard: every split cert must still be VALID and unused
            const allInTxns = await this.txnDao.Model.findAll({
                where: { share_id: txn.share_id, transaction_status: 'IN', is_deleted: 0 },
                raw: true,
            });
            for (const inTxn of allInTxns) {
                if (inTxn.status !== 'VALID')
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, `Cannot retain: split cert ${inTxn.share_cert_no || inTxn.share_transaction_id} is no longer valid`);
                const furtherUse = await this.txnDao.Model.findOne({
                    where: { old_share_id: inTxn.share_transaction_id, is_deleted: 0, status: 'VALID' },
                    raw: true,
                });
                if (furtherUse)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, `Cannot retain: split cert ${inTxn.share_cert_no || inTxn.share_transaction_id} has already been used in another transaction`);
            }

            const inTxnIds = allInTxns.map(t => t.share_transaction_id);

            await Promise.all([
                // Restore source certs to VALID
                this.txnDao.Model.update(
                    { status: 'VALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: sourceIds.map(Number) } } }
                ),
                // Invalidate OUT + IN rows of this split
                this.txnDao.Model.update(
                    { status: 'INVALID', updated_by: userId },
                    { where: { share_id: txn.share_id, transaction_status: 'OUT', is_deleted: 0 } }
                ),
                ...(inTxnIds.length ? [
                    this.txnDao.Model.update(
                        { status: 'INVALID', updated_by: userId },
                        { where: { share_transaction_id: { [Op.in]: inTxnIds } } }
                    ),
                    this.paymentDao.Model.update(
                        { is_deleted: 1, updated_by: userId },
                        { where: { share_transaction_id: { [Op.in]: inTxnIds } } }
                    ),
                    ...(models.share_distinctive ? [
                        models.share_distinctive.update(
                            { is_deleted: 1, updated_by: userId },
                            { where: { share_transaction_id: { [Op.in]: inTxnIds } } }
                        ),
                    ] : []),
                ] : []),
                // Soft-delete ledger rows
                this.ledgerDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_id: txn.share_id } }
                ),
                // Soft-delete share header
                this.shareDao.updateWhere(
                    { is_deleted: 1, updated_by: userId },
                    { share_id: txn.share_id }
                ),
            ]);

            // Club split: remove the weighted pool and restore the source pools
            const splitEsIds = oldData?.split_es_ids || [];
            if (splitEsIds.length > 0) {
                await deleteEntityShares(splitEsIds, userId, models);
                await restoreEntitySharesSnapshot(oldData?.source_es_snapshot, userId, models);
            }

            return responseHandler.returnSuccess(httpStatus.OK, 'Split retained (reversed) successfully');
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── CREATE COMBINE (combine share certs) ─────────────────────────────────────
    //
    // Combines two or more certs of the SAME holder under one new cert no.
    // Per share is never changed: sources are grouped by their company share pool
    // (one pool = one per share) and the new cert gets one IN row per group, e.g.
    //   s1 70 @1 + s2 30 @1 + s3 100 @2  →  sc1 100 @1  +  sc1 100 @2
    // - sources → INVALID with an OUT row each
    // - entity_shares untouched (every group stays in its own pool)
    //
    // body: { entity_id, source_txn_ids, combine_no, combine_date, remarks,
    //         new_cert_no, new_folio_no?, distinctive_from?, distinctive_to? }

    createCombine = async (body, userId) => {
        try {
            const models = getCurrentModels();
            const {
                entity_id, combine_no, combine_date, remarks,
                new_cert_no, new_folio_no, distinctive_from, distinctive_to,
            } = body;
            const sourceIds = (Array.isArray(body.source_txn_ids) ? body.source_txn_ids : []).filter(Boolean).map(Number);
            const certNo    = String(new_cert_no || '').trim();

            if (!entity_id)    return responseHandler.returnError(httpStatus.BAD_REQUEST, 'entity_id is required');
            if (!combine_date) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Combine date is required');
            if (!certNo)       return responseHandler.returnError(httpStatus.BAD_REQUEST, 'New cert no. is required');
            if (sourceIds.length < 2)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Select at least two certificates to combine');

            // ── Fetch & validate source txns ──────────────────────────────────
            const sourceTxns = await this.txnDao.Model.findAll({
                where: { share_transaction_id: { [Op.in]: sourceIds }, is_deleted: 0, status: 'VALID', transaction_status: { [Op.in]: ['IN', 'NONE'] } },
                order: [['share_transaction_id', 'ASC']],
                raw: true,
            });
            if (sourceTxns.length !== sourceIds.length)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'One or more source certificates are invalid or already used');

            const firstSrc = sourceTxns[0];
            const sameAs = (f) => sourceTxns.every(t => String(t[f]) === String(firstSrc[f]));
            if (!sameAs('official_entity_id'))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'All certificates must belong to the same shareholder');
            if (!sameAs('share_class_id') || !sameAs('currency') || !sameAs('share_type'))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'All certificates must have the same currency, share class and share type');

            // New cert no must not clash with an active cert (sources excluded — they are invalidated)
            const clash = await this.txnDao.Model.findOne({
                where: {
                    entity_id,
                    share_cert_no:        certNo,
                    status:               'VALID',
                    transaction_status:   { [Op.in]: ['IN', 'NONE'] },
                    is_deleted:           0,
                    share_transaction_id: { [Op.notIn]: sourceIds },
                },
                raw: true,
            });
            if (clash)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, `Cert no. "${certNo}" is already in use`);

            // ── Group sources by company share pool (= per share) ─────────────
            const groups = [];
            const groupByPool = {};
            for (const t of sourceTxns) {
                const k = String(t.company_share_id);
                if (!groupByPool[k]) {
                    groupByPool[k] = { first: t, txns: [], qty: 0, issued: 0, paidup: 0, cash: 0, oc: 0 };
                    groups.push(groupByPool[k]);
                }
                const g = groupByPool[k];
                g.txns.push(t);
                g.qty    += Number(t.no_of_shares         || 0);
                g.issued += Number(t.issued_share_capital || 0);
                g.paidup += Number(t.paidup_share_capital || 0);
                g.cash   += Number(t.cash                 || 0);
                g.oc     += Number(t.otherwise_cash       || 0);
            }

            const txType     = await models.transaction_type?.findOne({ where: { t_slug: 'combine-shares' } });
            const tx_type_id = txType?.t_id || 8;
            const share_set_id = uuidv4();

            // ── Create share header ───────────────────────────────────────────
            const shareHeader = await this.shareDao.create({
                entity_id,
                transaction_type_id:       tx_type_id,
                extra_type_of_transaction: 'COMBINE',
                transaction_date:          combine_date,
                status:                    'VALID',
                source_from:               'MANUAL',
                share_set_id,
                remarks:                   remarks || null,
                created_by:                userId || null,
                updated_by:                userId || null,
            });
            if (!shareHeader) throw new Error('Failed to create combine share header');

            const txnBase = {
                share_id:           shareHeader.share_id,
                share_set_id,
                entity_id,
                currency:           firstSrc.currency,
                share_class_id:     firstSrc.share_class_id,
                share_type:         firstSrc.share_type,
                official_type:      firstSrc.official_type,
                official_entity_id: firstSrc.official_entity_id,
                transaction_no:     combine_no || null,
                old_share_class_id: firstSrc.share_class_id || null,
                old_currency:       firstSrc.currency       || null,
                old_data:           { source_txn_ids: sourceIds },
                is_retain:          0, is_ubo: firstSrc.is_ubo || 0, is_partially_paid: 0,
                stamp_duty_payment: 0,
                data_from:          'MANUAL', status: 'VALID', is_confirm: 1, is_deleted: 0,
                created_by:         userId || null, updated_by: userId || null,
            };

            // ── Invalidate source certs ───────────────────────────────────────
            await this.txnDao.Model.update(
                { status: 'INVALID', updated_by: userId },
                { where: { share_transaction_id: { [Op.in]: sourceIds } } }
            );

            // ── OUT row per source cert ───────────────────────────────────────
            for (const src of sourceTxns) {
                await this.txnDao.create({
                    ...txnBase,
                    company_share_id:     src.company_share_id,
                    transaction_status:   'OUT',
                    folio_no:             src.folio_no || null,
                    share_cert_no:        src.share_cert_no || null,
                    no_of_shares:         src.no_of_shares,
                    per_share:            src.per_share,
                    issued_per_share:     src.issued_per_share ?? src.per_share,
                    issued_share_capital: src.issued_share_capital,
                    paidup_share_capital: src.paidup_share_capital,
                    no_consideration:     1,
                    transactional_consideration: null,
                    old_share_id:         src.share_transaction_id,
                    old_share_cert_no:    src.share_cert_no || null,
                });
            }

            // ── One IN row per per-share group, all under the new cert no. ────
            const folioNo = String(new_folio_no || '').trim() || firstSrc.folio_no || null;
            const inTxns  = [];
            for (const g of groups) {
                // Consideration carried over from the sources; fall back to paid-up as cash
                const hasConsid = (g.cash + g.oc) > 0;
                const cash = hasConsid ? g.cash : g.paidup;
                const oc   = hasConsid ? g.oc   : 0;

                const inTxn = await this.txnDao.create({
                    ...txnBase,
                    company_share_id:     g.first.company_share_id,
                    transaction_status:   'IN',
                    folio_no:             folioNo,
                    share_cert_no:        certNo,
                    no_of_shares:         g.qty,
                    per_share:            g.first.per_share,
                    issued_per_share:     g.first.issued_per_share ?? g.first.per_share,
                    issued_share_capital: g.issued,
                    paidup_share_capital: g.paidup,
                    cash:                 cash || null,
                    otherwise_cash:       oc   || null,
                    no_consideration:     0,
                    transactional_consideration: (cash + oc) || null,
                    transferor_official_entity_id: firstSrc.official_entity_id,
                    transferor_no_of_shares:       g.qty,
                    transferor_issued_capital:     g.issued,
                    transferor_paidup_capital:     g.paidup,
                    old_share_id:         g.first.share_transaction_id,
                    old_share_cert_no:    g.first.share_cert_no || null,
                });
                if (!inTxn) throw new Error('Failed to create combined cert');
                inTxns.push(inTxn);

                // Payments: carried over from the original certs
                const payBase = {
                    entity_id, share_transaction_id: inTxn.share_transaction_id, share_set_id,
                    no_consideration: 0, consideration_description: 'Previously paid on original certificates',
                    payment_date: combine_date, is_deleted: 0, created_by: userId || null, updated_by: userId || null,
                };
                const payRows = [];
                if (cash > 0) payRows.push({ ...payBase, payment_type: 'CASH',                cash,       otherwise_cash: null });
                if (oc   > 0) payRows.push({ ...payBase, payment_type: 'OTHERWISE_THAN_CASH', cash: null, otherwise_cash: oc });
                if (payRows.length) await this.paymentDao.bulkCreate(payRows);
            }

            // ── cs_share_distinctive (one range for the combined cert) ───────
            if ((distinctive_from || distinctive_to) && models.share_distinctive) {
                await models.share_distinctive.create({
                    entity_id,
                    share_transaction_id: inTxns[0].share_transaction_id,
                    share_set_id,
                    share_cert_no:    certNo,
                    distinctive_from: distinctive_from || null,
                    distinctive_to:   distinctive_to   || null,
                    no_of_shares:     groups.reduce((s, g) => s + g.qty, 0),
                    is_deleted:       0,
                    created_by:       userId || null,
                    updated_by:       userId || null,
                });
            }

            return responseHandler.returnSuccess(httpStatus.CREATED, 'Combine saved successfully', {
                share_id:   shareHeader.share_id,
                share_set_id,
                in_txn_ids: inTxns.map(t => t.share_transaction_id),
            });
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── RETAIN COMBINE ───────────────────────────────────────────────────────────

    retainCombine = async (txn_id, userId) => {
        try {
            const models = getCurrentModels();
            const txn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: txn_id, is_deleted: 0 },
                raw: true,
            });
            if (!txn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transaction not found');
            if (txn.status !== 'VALID' || txn.transaction_status !== 'IN')
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only the VALID combined certificate can be retained');

            const shareHeader = await this.shareDao.Model.findOne({ where: { share_id: txn.share_id }, raw: true });
            if (!shareHeader || shareHeader.extra_type_of_transaction !== 'COMBINE')
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only combine transactions can be retained here');

            const oldData   = txn.old_data;
            const sourceIds = oldData?.source_txn_ids;
            if (!Array.isArray(sourceIds) || sourceIds.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source certificate references not found');

            // Guard: every per-share line of the combined cert must still be VALID and unused
            const allInTxns = await this.txnDao.Model.findAll({
                where: { share_id: txn.share_id, transaction_status: 'IN', is_deleted: 0 },
                raw: true,
            });
            for (const inTxn of allInTxns) {
                if (inTxn.status !== 'VALID')
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cannot retain: part of the combined certificate is no longer valid');
                const furtherUse = await this.txnDao.Model.findOne({
                    where: { old_share_id: inTxn.share_transaction_id, is_deleted: 0, status: 'VALID' },
                    raw: true,
                });
                if (furtherUse)
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cannot retain: the combined certificate has already been used in another transaction');
            }
            const inTxnIds = allInTxns.map(t => t.share_transaction_id);

            await Promise.all([
                // Restore source certs to VALID
                this.txnDao.Model.update(
                    { status: 'VALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: sourceIds.map(Number) } } }
                ),
                // Invalidate OUT rows + combined IN row
                this.txnDao.Model.update(
                    { status: 'INVALID', updated_by: userId },
                    { where: { share_id: txn.share_id, is_deleted: 0 } }
                ),
                this.paymentDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: inTxnIds } } }
                ),
                ...(models.share_distinctive ? [
                    models.share_distinctive.update(
                        { is_deleted: 1, updated_by: userId },
                        { where: { share_transaction_id: { [Op.in]: inTxnIds } } }
                    ),
                ] : []),
                this.ledgerDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_id: txn.share_id } }
                ),
                this.shareDao.updateWhere(
                    { is_deleted: 1, updated_by: userId },
                    { share_id: txn.share_id }
                ),
            ]);

            // entity_shares never changed on combine — nothing to restore

            return responseHandler.returnSuccess(httpStatus.OK, 'Combine retained (reversed) successfully');
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── CREATE RECLASSIFICATION (move a cert to another share class) ───────────
    //
    // The whole cert moves to another share class + share type combination
    // (e.g. Ordinary/Normal → Preference/Normal). Currency and per share stay the same.
    // - source → INVALID with an OUT row; one IN row in the new class
    // - company shares: source pool reduced by the cert; the cert is added to the
    //   new class's pool with the same currency/share type/per share, or a new
    //   pool is created when none exists
    // - folio no. must not duplicate an existing active cert's folio
    //
    // body: { entity_id, source_txn_id, new_share_class_id, new_share_type?, reclass_no,
    //         reclass_date, remarks, new_cert_no, new_folio_no }

    createReclassification = async (body, userId) => {
        try {
            const models = getCurrentModels();
            const {
                entity_id, source_txn_id, new_share_class_id,
                reclass_no, reclass_date, remarks,
            } = body;
            const certNo  = String(body.new_cert_no  || '').trim();
            const folioNo = String(body.new_folio_no || '').trim();

            if (!entity_id)          return responseHandler.returnError(httpStatus.BAD_REQUEST, 'entity_id is required');
            if (!source_txn_id)      return responseHandler.returnError(httpStatus.BAD_REQUEST, 'source_txn_id is required');
            if (!new_share_class_id) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'New share class is required');
            if (!reclass_date)       return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Date of transaction is required');
            if (!folioNo)            return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Folio no. is required');
            if (!certNo)             return responseHandler.returnError(httpStatus.BAD_REQUEST, 'New share cert no. is required');

            // ── Fetch & validate source txn ───────────────────────────────────
            const src = await this.txnDao.Model.findOne({
                where: { share_transaction_id: Number(source_txn_id), is_deleted: 0, status: 'VALID', transaction_status: { [Op.in]: ['IN', 'NONE'] } },
                raw: true,
            });
            if (!src) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source certificate not found or already used');
            const newShareType = body.new_share_type || src.share_type || 'NORMAL';
            if (!['NORMAL', 'BONUS', 'GUARANTEE'].includes(newShareType))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Invalid share type');
            if (String(src.share_class_id) === String(new_share_class_id) && newShareType === (src.share_type || 'NORMAL'))
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Choose a share class / share type different from the current one');

            const newClass = await models.share_class_master?.findOne({ where: { sc_id: Number(new_share_class_id), is_deleted: 0 }, raw: true });
            if (!newClass) return responseHandler.returnError(httpStatus.BAD_REQUEST, 'New share class not found');

            // Folio no. must be unique among active certs
            const folioClash = await this.txnDao.Model.findOne({
                where: { entity_id, folio_no: folioNo, status: 'VALID', transaction_status: { [Op.in]: ['IN', 'NONE'] }, is_deleted: 0 },
                raw: true,
            });
            if (folioClash) return responseHandler.returnError(httpStatus.BAD_REQUEST, `Folio no. "${folioNo}" already exists`);

            // Cert no. is unique company-wide among active certs (source excluded — it is invalidated)
            const certClash = await this.txnDao.Model.findOne({
                where: {
                    entity_id, share_cert_no: certNo, status: 'VALID',
                    transaction_status: { [Op.in]: ['IN', 'NONE'] }, is_deleted: 0,
                    share_transaction_id: { [Op.ne]: src.share_transaction_id },
                },
                raw: true,
            });
            if (certClash) return responseHandler.returnError(httpStatus.BAD_REQUEST, `Share Cert No "${certNo}" already exists`);

            const qty    = Number(src.no_of_shares         || 0);
            const issued = Number(src.issued_share_capital || 0);
            const paidup = Number(src.paidup_share_capital || 0);
            const perSh  = Number(src.per_share            || 0);
            const issuedPS = src.issued_per_share ?? perSh;

            // ── Company shares: snapshot source pool + matching target pool ──
            const { snapshot: srcSnap, reductionMap } = await buildSourceESContext([src], models);
            const targetCandidates = await models.entity_shares.findAll({
                where: {
                    entity_id,
                    currency:       src.currency,
                    share_class_id: Number(new_share_class_id),
                    share_type:     newShareType,
                    is_deleted:     0,
                },
                raw: true,
            });
            const targetES = targetCandidates.find(e => Math.abs(Number(e.per_share || 0) - perSh) < 1e-9) || null;

            const txType     = await models.transaction_type?.findOne({ where: { t_slug: 'reclassification' } });
            const tx_type_id = txType?.t_id || 19;
            const share_set_id = uuidv4();

            const reclassEsIds = [];
            const esSnapshot   = [...srcSnap, ...(targetES ? [targetES] : [])];
            let targetEsId;
            if (targetES) {
                await models.entity_shares.update({
                    number_of_shares:         Number(targetES.number_of_shares         || 0) + qty,
                    authorized_share_capital: Number(targetES.authorized_share_capital || 0) + issued,
                    issued_share_capital:     Number(targetES.issued_share_capital     || 0) + issued,
                    paid_up_capital:          Number(targetES.paid_up_capital          || 0) + paidup,
                    updated_by:               userId,
                }, { where: { id: targetES.id } });
                targetEsId = targetES.id;
            } else {
                const newES = await createEntityShareEntry({
                    models, entity_id,
                    currency:       src.currency,
                    share_class_id: Number(new_share_class_id),
                    share_type:     newShareType,
                    date:           reclass_date,
                    txnType:        'reclassification',
                    userId,
                    shares:         qty,
                    issued,
                    paidup,
                    perShare:       perSh,
                    issuedPerShare: issuedPS,
                    remarks:        'Created by reclassification',
                });
                reclassEsIds.push(newES.id);
                targetEsId = newES.id;
            }
            await reduceEntityShares({ snapshot: srcSnap, reductionMap, userId, models });

            // ── Create share header ───────────────────────────────────────────
            const shareHeader = await this.shareDao.create({
                entity_id,
                transaction_type_id:       tx_type_id,
                extra_type_of_transaction: 'RECLASSIFICATION',
                transaction_date:          reclass_date,
                status:                    'VALID',
                source_from:               'MANUAL',
                share_set_id,
                remarks:                   remarks || null,
                created_by:                userId || null,
                updated_by:                userId || null,
            });
            if (!shareHeader) throw new Error('Failed to create reclassification share header');

            const txnBase = {
                share_id:           shareHeader.share_id,
                share_set_id,
                entity_id,
                currency:           src.currency,
                share_type:         src.share_type,
                official_type:      src.official_type,
                official_entity_id: src.official_entity_id,
                transaction_no:     reclass_no || null,
                per_share:          perSh,
                issued_per_share:   issuedPS,
                old_share_id:       src.share_transaction_id,
                old_share_class_id: src.share_class_id || null,
                old_currency:       src.currency       || null,
                old_share_cert_no:  src.share_cert_no  || null,
                old_data: {
                    source_txn_ids:     [src.share_transaction_id],
                    reclass_es_ids:     reclassEsIds,
                    source_es_snapshot: buildESSnapshotForOldData(esSnapshot),
                },
                is_retain: 0, is_ubo: src.is_ubo || 0, is_partially_paid: 0, stamp_duty_payment: 0,
                data_from: 'MANUAL', status: 'VALID', is_confirm: 1, is_deleted: 0,
                created_by: userId || null, updated_by: userId || null,
            };

            // ── Invalidate source cert + OUT row in the old class ────────────
            await this.txnDao.Model.update(
                { status: 'INVALID', updated_by: userId },
                { where: { share_transaction_id: src.share_transaction_id } }
            );
            await this.txnDao.create({
                ...txnBase,
                company_share_id:     src.company_share_id,
                share_class_id:       src.share_class_id,
                transaction_status:   'OUT',
                folio_no:             src.folio_no || null,
                share_cert_no:        src.share_cert_no || null,
                no_of_shares:         qty,
                issued_share_capital: issued,
                paidup_share_capital: paidup,
                no_consideration:     1,
                transactional_consideration: null,
            });

            // ── IN row in the new class ───────────────────────────────────────
            const hasConsid = (Number(src.cash || 0) + Number(src.otherwise_cash || 0)) > 0;
            const cash = hasConsid ? Number(src.cash || 0)           : paidup;
            const oc   = hasConsid ? Number(src.otherwise_cash || 0) : 0;
            const inTxn = await this.txnDao.create({
                ...txnBase,
                company_share_id:     targetEsId,
                share_class_id:       Number(new_share_class_id),
                share_type:           newShareType,
                transaction_status:   'IN',
                folio_no:             folioNo,
                share_cert_no:        certNo,
                no_of_shares:         qty,
                issued_share_capital: issued,
                paidup_share_capital: paidup,
                cash:                 cash || null,
                otherwise_cash:       oc   || null,
                no_consideration:     0,
                transactional_consideration: (cash + oc) || null,
                transferor_official_entity_id: src.official_entity_id,
                transferor_no_of_shares:       qty,
                transferor_issued_capital:     issued,
                transferor_paidup_capital:     paidup,
            });
            if (!inTxn) throw new Error('Failed to create reclassified cert');

            // ── Payments: carried over from the original cert ────────────────
            const payBase = {
                entity_id, share_transaction_id: inTxn.share_transaction_id, share_set_id,
                no_consideration: 0, consideration_description: 'Previously paid on original certificate',
                payment_date: reclass_date, is_deleted: 0, created_by: userId || null, updated_by: userId || null,
            };
            const payRows = [];
            if (cash > 0) payRows.push({ ...payBase, payment_type: 'CASH',                cash,       otherwise_cash: null });
            if (oc   > 0) payRows.push({ ...payBase, payment_type: 'OTHERWISE_THAN_CASH', cash: null, otherwise_cash: oc });
            if (payRows.length) await this.paymentDao.bulkCreate(payRows);

            return responseHandler.returnSuccess(httpStatus.CREATED, 'Reclassification saved successfully', {
                share_id:  shareHeader.share_id,
                share_set_id,
                in_txn_id: inTxn.share_transaction_id,
            });
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── RETAIN RECLASSIFICATION ──────────────────────────────────────────────────

    retainReclassification = async (txn_id, userId) => {
        try {
            const models = getCurrentModels();
            const txn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: txn_id, is_deleted: 0 },
                raw: true,
            });
            if (!txn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transaction not found');
            if (txn.status !== 'VALID' || txn.transaction_status !== 'IN')
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only the VALID reclassified certificate can be retained');

            const shareHeader = await this.shareDao.Model.findOne({ where: { share_id: txn.share_id }, raw: true });
            if (!shareHeader || shareHeader.extra_type_of_transaction !== 'RECLASSIFICATION')
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Only reclassification transactions can be retained here');

            const oldData   = txn.old_data;
            const sourceIds = oldData?.source_txn_ids;
            if (!Array.isArray(sourceIds) || sourceIds.length === 0)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Source certificate references not found');

            const furtherUse = await this.txnDao.Model.findOne({
                where: { old_share_id: txn.share_transaction_id, is_deleted: 0, status: 'VALID' },
                raw: true,
            });
            if (furtherUse)
                return responseHandler.returnError(httpStatus.BAD_REQUEST, 'Cannot retain: the reclassified certificate has already been used in another transaction');

            await Promise.all([
                this.txnDao.Model.update(
                    { status: 'VALID', updated_by: userId },
                    { where: { share_transaction_id: { [Op.in]: sourceIds.map(Number) } } }
                ),
                this.txnDao.Model.update(
                    { status: 'INVALID', updated_by: userId },
                    { where: { share_id: txn.share_id, is_deleted: 0 } }
                ),
                this.paymentDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_transaction_id: txn.share_transaction_id } }
                ),
                this.ledgerDao.Model.update(
                    { is_deleted: 1, updated_by: userId },
                    { where: { share_id: txn.share_id } }
                ),
                this.shareDao.updateWhere(
                    { is_deleted: 1, updated_by: userId },
                    { share_id: txn.share_id }
                ),
            ]);

            // Company shares: drop the pool created for the new class (if any) and
            // restore the source pool + the new-class pool it was added to
            await deleteEntityShares(oldData?.reclass_es_ids || [], userId, models);
            await restoreEntitySharesSnapshot(oldData?.source_es_snapshot, userId, models);

            return responseHandler.returnSuccess(httpStatus.OK, 'Reclassification retained (reversed) successfully');
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── CHECK FOLIO NO. (must not duplicate an active cert's folio) ─────────────

    checkFolioNo = async ({ entity_id, folio_no }) => {
        try {
            const folioNo = String(folio_no || '').trim();
            if (!entity_id || !folioNo)
                return responseHandler.returnSuccess(httpStatus.OK, 'Nothing to check', { exists: false });
            const existing = await this.txnDao.Model.findOne({
                where: { entity_id, folio_no: folioNo, status: 'VALID', transaction_status: { [Op.in]: ['IN', 'NONE'] }, is_deleted: 0 },
                attributes: ['share_transaction_id'],
                raw: true,
            });
            return responseHandler.returnSuccess(httpStatus.OK, existing ? 'Folio no. exists' : 'Folio no. available', { exists: !!existing });
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    // ── CHECK REPLACEMENT CERT (lookup existing cert for combining) ─────────────

    listCompatibleReplacementCerts = async ({ entity_id, source_txn_id }) => {
        try {
            const models = getCurrentModels();
            const sourceTxn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: Number(source_txn_id), is_deleted: 0, status: 'VALID' },
                raw: true,
            });
            if (!sourceTxn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Source transaction not found');

            const certs = await this.txnDao.Model.findAll({
                where: {
                    entity_id,
                    status:             'VALID',
                    transaction_status: { [Op.in]: ['IN', 'NONE'] },
                    is_deleted:         0,
                    share_type:         sourceTxn.share_type,
                    currency:           sourceTxn.currency,
                    official_entity_id: sourceTxn.official_entity_id,
                    share_transaction_id: { [Op.ne]: Number(source_txn_id) },
                },
                attributes: ['share_transaction_id', 'share_cert_no', 'folio_no', 'no_of_shares', 'per_share'],
                raw: true,
                order: [['share_cert_no', 'ASC']],
            });
            return responseHandler.returnSuccess(httpStatus.OK, 'Compatible certs', { certs });
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    checkReplacementCert = async ({ entity_id, cert_no, source_txn_id }) => {
        try {
            const models = getCurrentModels();
            const sourceTxn = await this.txnDao.Model.findOne({
                where: { share_transaction_id: Number(source_txn_id) },
                attributes: ['per_share'],
                raw: true,
            });
            // A cert no. can have several lines (one per per_share); prefer the matching one
            const existingLines = await this.txnDao.Model.findAll({
                where: {
                    entity_id,
                    share_cert_no:        cert_no,
                    status:               'VALID',
                    transaction_status:   { [Op.in]: ['IN', 'NONE'] },
                    is_deleted:           0,
                    share_transaction_id: { [Op.ne]: Number(source_txn_id) },
                },
                include: [{ model: models.official_entity, as: 'official_entity', attributes: ['name'], required: false }],
                raw: true,
            });
            const existing = existingLines.find(l => sourceTxn && Number(l.per_share) === Number(sourceTxn.per_share))
                || existingLines[0] || null;
            if (!existing) return responseHandler.returnSuccess(httpStatus.OK, 'No existing cert', { exists: false });
            return responseHandler.returnSuccess(httpStatus.OK, 'Existing cert found', {
                exists: true,
                share_transaction_id: existing.share_transaction_id,
                no_of_shares:         existing.no_of_shares,
                per_share:            existing.per_share,
                share_class_id:       existing.share_class_id,
                share_type:           existing.share_type,
                currency:             existing.currency,
                official_entity_id:   existing.official_entity_id,
                holder_name:          existing['official_entity.name'] || null,
            });
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };

    delete = async (id, userId) => {
        try {
            const txn = await this.txnDao.findOneByWhere({ share_transaction_id: id, is_deleted: 0 });
            if (!txn) return responseHandler.returnError(httpStatus.NOT_FOUND, 'Transaction not found');

            await this.txnDao.updateByWhere(
                { is_deleted: 1, updated_by: userId },
                { share_transaction_id: id },
            );
            // Soft-delete header if all lines deleted
            await this.shareDao.updateByWhere(
                { is_deleted: 1, updated_by: userId },
                { share_id: txn.share_id },
            );
            return responseHandler.returnSuccess(httpStatus.OK, 'Transaction deleted');
        } catch (e) {
            logger.error(e);
            return responseHandler.returnError(httpStatus.BAD_GATEWAY, e.message);
        }
    };
}

module.exports = ShareService;
