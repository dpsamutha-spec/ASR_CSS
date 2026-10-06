'use strict';

const httpStatus = require('http-status');
const { Op }     = require('sequelize');

const { getCurrentModels }      = require('../../models');
const OfficialDao               = require('../../dao/official/OfficialDao');
const OfficialDateDao           = require('../../dao/official/OfficialDateDao');
const OfficialRepresentativeDao = require('../../dao/official/OfficialRepresentativeDao');
const OfficialCompanyContactDao = require('../../dao/official/OfficialCompanyContactDao');
const responseHandler           = require('../../helper/responseHandler');
const logger                    = require('../../config/logger');
const {
    buildCompleteWhere,
    buildOrderClause,
    getPaginationParams,
} = require('../../helper/searchHelper');

const CONTROLLER_SLUG = 'controllers';

const SEARCH_FIELDS = ['official_type'];
const FILTER_FIELDS = ['official_master_id', 'entity_id', 'official_type', 'is_current'];

class OfficialService {

    constructor() {
        this.officialDao = new OfficialDao();
        this.dateDao     = new OfficialDateDao();
        this.repDao      = new OfficialRepresentativeDao();
        this.contactDao  = new OfficialCompanyContactDao();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONTACT HELPERS
    //
    // Column names match official_company_contact model exactly:
    //   mobile, mobile_code, telephone, telephone_code, office, office_code, ext_no
    //
    // ADD flow  : contact_id present → link existing (no write)
    //             contact_id absent  → insert new (skip if all fields empty)
    //
    // EDIT flow : contact_id present → UPDATE that existing row
    //             contact_id absent  → insert new (skip if all fields empty)
    //
    // Resolved contact_id is returned so the caller writes it to
    // cs_officials.company_contact_id inside the same transaction.
    // ─────────────────────────────────────────────────────────────────────────

    _isContactEmpty(c) {
        return !c.email && !c.mobile && !c.telephone && !c.office && !c.ext_no;
    }

    // Maps frontend payload → DB column names (per the Sequelize model)
    // In _handleContactOnCreate, the create call is already correct.
    _buildContactRow({ entity_id, official_entity_id, contact, userId }) {
        return {
            entity_id:          entity_id || null,
            official_entity_id: String(official_entity_id || ''),
            email:          contact.email          || '',
            mobile:         contact.mobile         || '',
            mobile_code:    contact.mobile_code    || '',
            telephone:      contact.telephone      || '',
            telephone_code: contact.telephone_code || '',
            office:         contact.office         || '',
            office_code:    contact.office_code    || '',
            ext_no:         contact.ext_no         || '',
            deleted:        0,
            created_date:   new Date(),
            created_by:     userId || null,
        };
    }

    // Fields to SET on an UPDATE — same column names, no pk/audit cols
    _buildContactUpdateFields(contact) {
        return {
            email:          contact.email          || '',
            mobile:         contact.mobile         || '',
            mobile_code:    contact.mobile_code    || '',
            telephone:      contact.telephone      || '',
            telephone_code: contact.telephone_code || '',
            office:         contact.office         || '',
            office_code:    contact.office_code    || '',
            ext_no:         contact.ext_no            || '',
        };
    }

    async _handleContactOnCreate({ entity_id, official_entity_id, contact, userId, t }) {
        if (!contact) return null;

        const contact_id = contact.contact_id ? Number(contact.contact_id) : null;

        // Existing contact selected in dropdown — just link it, nothing to write
        if (contact_id) return contact_id;

        // New contact — skip insert if every field is blank
        if (this._isContactEmpty(contact)) return null;

        const models = getCurrentModels();
        const row = await models.official_company_contact.create(
            this._buildContactRow({ entity_id, official_entity_id: official_entity_id, contact, userId }),
            { transaction: t }
        );
        return row.contact_id;
    }

    async _handleContactOnUpdate({ entity_id, official_entity_id, contact, userId, t }) {
        if (!contact) return null;

        const contact_id = contact.contact_id ? Number(contact.contact_id) : null;
        const models     = getCurrentModels();

        if (contact_id) {
            // User had an existing contact selected — UPDATE it with whatever fields they changed
            const existing = await models.official_company_contact.findOne({
                where: { contact_id, deleted: 0 },
            });
            if (existing) {
                await models.official_company_contact.update(
                    this._buildContactUpdateFields(contact),
                    { where: { contact_id }, transaction: t }
                );
            }
            return contact_id;
        }

        // No contact_id — insert new row only if at least one field has a value
        if (this._isContactEmpty(contact)) return null;

        const row = await models.official_company_contact.create(
            this._buildContactRow({ entity_id, official_entity_id, contact, userId }),
            { transaction: t }
        );
        return row.contact_id;
    }

    // ── Fetch helpers ─────────────────────────────────────────────────────────

    // Returns an error message, or null when the Alternate Director To link is valid
    async _validateAlternateDirectorTo(models, body) {
        const today  = new Date().toISOString().slice(0, 10);
        const active = { [Op.or]: [{ ceased_date: null }, { ceased_date: { [Op.gt]: today } }] };

        const alternate = await models.officials.findOne({
            where: { official_id: body.reference_official_id, is_deleted: 0 },
            raw: true,
        });
        if (!alternate) return 'Alternate director not found.';
        if (!(await this._hasActiveSubRole(models, alternate.official_id, 'alternate-substitute-director')))
            return 'Only a director appointed as Alternate / Substitute Director can be an alternate director to another director.';

        if (!body.official_entity_id) return 'Please choose the director.';
        if (String(body.official_entity_id) === String(alternate.official_entity_id))
            return 'A director cannot be an alternate director to themselves.';

        // Principal must be an active (not ceased) director of the same company
        const principal = await models.officials.findOne({
            where:   { entity_id: alternate.entity_id, official_entity_id: body.official_entity_id, official_master_id: alternate.official_master_id, is_ref_id: 0, is_deleted: 0 },
            include: [{ model: models.officials_date, as: 'date_record', required: true, where: { is_deleted: 0, ...active } }],
        });
        if (!principal) return 'The chosen person is not an active director of this company.';

        // One principal at a time
        const existing = await models.officials.findOne({
            where:   { reference_official_id: alternate.official_id, official_master_slug: 'alternate-director-to', is_deleted: 0 },
            include: [{ model: models.officials_date, as: 'date_record', required: true, where: { is_deleted: 0, ...active } }],
        });
        if (existing) return 'This director is already an alternate director to another director. Cease that first.';

        return null;
    }

    // True when the official has the sub role appointed and not yet ceased
    async _hasActiveSubRole(models, officialId, subRoleSlug) {
        const today = new Date().toISOString().slice(0, 10);
        const rec = await models.officials_date.findOne({
            where: {
                official_id:          officialId,
                official_master_slug: subRoleSlug,
                is_deleted:           0,
                appointment_date:     { [Op.ne]: null },
                [Op.or]: [{ ceased_date: null }, { ceased_date: { [Op.gt]: today } }],
            },
            raw: true,
        });
        return !!rec;
    }

    _withAssociations(models) {
        const includes = [];

        if (models.officials_date) {
            includes.push({ model: models.officials_date, as: 'date_record',  required: false, where: { is_deleted: 0 } });
            includes.push({ model: models.officials_date, as: 'date_records', required: false, where: { is_deleted: 0 } });
        }
        if (models.official_representaive) {
            includes.push({
                model:    models.official_representaive,
                as:       'representatives',
                required: false,
                where:    { is_deleted: 0 },
                include:  models.entities ? [{
                    model:      models.entities,
                    as:         'representative_entity',
                    required:   false,
                    attributes: ['entity_id', 'name', 'entity_type', 'client_no', 'status'],
                }] : [],
            });
        }
        if (models.entities) {
            const officialEntityIncludes = [];
            if (models.entity_individual_details) {
                officialEntityIncludes.push({
                    model: models.entity_individual_details,
                    as: 'individual_detail',
                    required: false,
                    attributes: ['member_dob', 'member_nationality'],
                });
            }
            if (models.entity_company_details) {
                officialEntityIncludes.push({
                    model: models.entity_company_details,
                    as: 'company_detail',
                    required: false,
                    attributes: [
                        'company_incorporation_date', 'company_fin_date', 'country',
                        'jurisdiction_incorp_name', 'jurisdiction_corp_name',
                        'jurisdiction_corp_id', 'e_status_id',
                    ],
                    include: models.entity_status ? [{
                        model: models.entity_status,
                        as: 'entity_status',
                        required: false,
                        attributes: ['e_status_name'],
                    }] : [],
                });
            }
            if (models.entity_identification) {
                officialEntityIncludes.push({
                    model: models.entity_identification,
                    as: 'identifications',
                    required: false,
                    where: { is_deleted: false },
                    attributes: [
                        'identification_id', 'id_number', 'uen_no', 'fbrn_reg_no',
                        'uf_no', 'domes_bus_no', 'acra_no', 'id_expired_date',
                        'm_identification_id', 'is_primary',
                    ],
                    include: models.member_id_type ? [{
                        model: models.member_id_type,
                        as: 'id_type',
                        required: false,
                        attributes: ['id_name', 'slug_name'],
                    }] : [],
                });
            }
            if (models.company_type) {
                officialEntityIncludes.push({
                    model: models.company_type,
                    as: 'company_type',
                    required: false,
                    attributes: ['company_type_name'],
                });
            }
            if (models.entity_address) {
                officialEntityIncludes.push({
                    model: models.entity_address,
                    as: 'addresses',
                    required: false,
                    where: { is_deleted: false },
                    attributes: [
                        'address_type', 'block_no', 'street_name', 'building_name',
                        'level_no', 'unit_no', 'city', 'state', 'postal_code',
                        'country', 'is_primary',
                    ],
                });
            }
            if (models.entity_contact) {
                officialEntityIncludes.push({
                    model: models.entity_contact,
                    as: 'contacts',
                    required: false,
                    where: { is_deleted: false },
                    attributes: ['contact_type', 'phone_country_code', 'contact_value', 'is_primary'],
                });
            }
            const registeredEntityIncludes = [];
            if (models.entity_identification) {
                registeredEntityIncludes.push({
                    model: models.entity_identification,
                    as: 'identifications',
                    required: false,
                    where: { is_deleted: false },
                    attributes: [
                        'id_number', 'uen_no', 'fbrn_reg_no', 'uf_no',
                        'domes_bus_no', 'acra_no', 'is_primary',
                    ],
                });
            }
            if (models.company_type) {
                registeredEntityIncludes.push({
                    model: models.company_type,
                    as: 'company_type',
                    required: false,
                    attributes: ['company_type_name'],
                });
            }
            if (models.entity_company_details) {
                registeredEntityIncludes.push({
                    model: models.entity_company_details,
                    as: 'company_detail',
                    required: false,
                    attributes: ['company_fin_date', 'e_status_id'],
                    include: models.entity_status ? [{
                        model: models.entity_status,
                        as: 'entity_status',
                        required: false,
                        attributes: ['e_status_name'],
                    }] : [],
                });
            }
            if (models.entity_contact) {
                registeredEntityIncludes.push({
                    model: models.entity_contact,
                    as: 'contacts',
                    required: false,
                    where: { is_deleted: false },
                    attributes: ['contact_type', 'phone_country_code', 'contact_value', 'is_primary'],
                });
            }
            includes.push({
                model:      models.entities,
                as:         'official_entity',
                required:   false,
                attributes: ['entity_id', 'name', 'entity_type', 'client_no', 'status'],
                include:    officialEntityIncludes,
            });
            includes.push({
                model:      models.entities,
                as:         'entity',
                required:   false,
                attributes: ['entity_id', 'name', 'entity_type', 'client_no', 'company_type_id'],
                include:    registeredEntityIncludes,
            });
        }
        if (models.official_master) {
            includes.push({
                model:      models.official_master,
                as:         'official_master',
                required:   false,
                attributes: ['official_master_id', 'official_master_name', 'official_master_slug', 'is_representative'],
            });
        }
        if (models.entity_identification) {
            includes.push({
                model:      models.entity_identification,
                as:         'identification',
                required:   false,
                attributes: [
                    'identification_id', 'id_number', 'uen_no', 'fbrn_reg_no',
                    'uf_no', 'domes_bus_no', 'acra_no', 'id_issued_country', 'id_issued_date',
                    'id_expired_date', 'm_identification_id',
                ],
                include: models.member_id_type ? [{
                    model:      models.member_id_type,
                    as:         'id_type',
                    required:   false,
                    attributes: ['id_name', 'slug_name'],
                }] : [],
            });
        }
        if (models.officials) {
            includes.push({
                model:    models.officials,
                as:       'joint_members',
                required: false,
                where:    { is_ref_id: 1, is_deleted: 0 },
                include:  models.entities ? [{
                    model:      models.entities,
                    as:         'official_entity',
                    required:   false,
                    attributes: ['entity_id', 'name', 'entity_type', 'client_no', 'status'],
                }] : [],
            });
        }

        // ── The current saved contact (single row via belongsTo) ──────────────
        // Used in edit mode to pre-select the right dropdown option and
        // show the saved field values.
        // Association: cs_officials.company_contact_id → official_company_contact.contact_id
        if (models.official_company_contact) {
            includes.push({
                model:    models.official_company_contact,
                as:       'company_contact',
                required: false,
            });
        }

        return includes;
    }

    // ── CREATE ────────────────────────────────────────────────────────────────

    create = async (body, userId) => {

        const models     = getCurrentModels();
        const t          = await models.sequelize.transaction();
        let   officialId = null;

        try {

            const now = new Date();

            // A director's Nominator can only be added while the director holds an
            // active "Nominee Director" sub role (appointed and not ceased)
            if (body.official_master_slug === 'nominator' && body.reference_official_id) {
                const parent = await models.officials.findOne({
                    where:   { official_id: body.reference_official_id, is_deleted: 0 },
                    include: [{ model: models.official_master, as: 'official_master', attributes: ['official_master_slug'], required: false }],
                });
                if (parent?.official_master?.official_master_slug === 'directors'
                    && !(await this._hasActiveSubRole(models, parent.official_id, 'nominee-director'))) {
                    await t.rollback();
                    return responseHandler.returnError(
                        httpStatus.BAD_REQUEST,
                        'Nominator can only be added for a director appointed as Nominee Director.'
                    );
                }
            }

            // "Alternate Director To": the alternate must hold an active "Alternate /
            // Substitute Director" sub role, the principal must be another active
            // director of the same company, and an alternate stands in for one director at a time
            if (body.official_master_slug === 'alternate-director-to' && body.reference_official_id) {
                const err = await this._validateAlternateDirectorTo(models, body);
                if (err) {
                    await t.rollback();
                    return responseHandler.returnError(httpStatus.BAD_REQUEST, err);
                }
            }

            // Duplicate check
            const dupWhere = {
                entity_id:             body.entity_id,
                official_entity_id:    body.official_entity_id || null,
                official_master_id:    body.official_master_id,
                is_deleted:            0,
                reference_official_id: body.reference_official_id || null,
            };
            if (!body.official_entity_id) {
                dupWhere.official_type = body.official_type || null;
            }
            const duplicate = await models.officials.findOne({ where: dupWhere });
            if (duplicate) {
                await t.rollback();
                return responseHandler.returnError(
                    httpStatus.BAD_REQUEST,
                    'This official already exists for the selected entity and role.'
                );
            }

            // Contact: resolve/insert before creating cs_officials so we have
            // the contact_id ready to write in one go
            const resolvedContactId = await this._handleContactOnCreate({
                entity_id:          body.entity_id,
                official_entity_id: body.official_entity_id || null,
                contact:            body.contact_details    || null,
                userId,
                t,
            });

            // 1. cs_officials
            const official = await models.officials.create({
                entity_id:                 body.entity_id,
                official_entity_id:        body.official_entity_id        || null,
                reference_official_id:     body.reference_official_id     || null,
                is_ref_id:                 body.is_ref_id                 ?? 0,
                official_master_id:        body.official_master_id,
                official_master_slug:      body.official_master_slug      || null,
                official_type:             body.official_type             || null,
                identification_id:         body.identification_id         || null,
                shareholder_type:          body.shareholder_type          || null,
                shareholder_property_type: body.shareholder_property_type || null,
                company_contact_id:        resolvedContactId              || null,
                is_current:                1,
                source_from:               'MANUAL',
                is_deleted:                0,
                created_date:              now,
                created_by:                userId || null,
                updated_date:              now,
                updated_by:                userId || null,
            }, { transaction: t });

            officialId = official.official_id;

            const baseDateRow = (overrides) => ({
                entity_id:    body.entity_id,
                official_id:  officialId,
                source_from:  'MANUAL',
                is_deleted:   0,
                created_date: now,
                created_by:   userId || null,
                updated_date: now,
                updated_by:   userId || null,
                ...overrides,
            });

            // 2a. Main date (is_main_role = '1')
            const mainDate = body.main_date || {};
            await models.officials_date.create(baseDateRow({
                official_master_slug:  mainDate.official_master_slug  || null,
                is_main_role:          '1',
                appointment_date:      mainDate.appointment_date      || null,
                ceased_date:           mainDate.ceased_date           || null,
                is_appt_proposed:      mainDate.is_appt_proposed      ?? 1,
                is_ceased_proposed:    mainDate.is_ceased_proposed    ?? 1,
                officials_appt_from:   mainDate.officials_appt_from   || null,
                officials_ceased_from: mainDate.officials_ceased_from || null,
                appt_manual:           1,
                ceased_manual:         mainDate.ceased_date ? 1 : 0,
                remarks:               mainDate.remarks               || null,
            }), { transaction: t });

            // 2b. Sub-role dates (is_main_role = '0')
            const subRoleDates = Array.isArray(body.sub_role_dates) ? body.sub_role_dates : [];
            for (const sr of subRoleDates) {
                await models.officials_date.create(baseDateRow({
                    official_master_slug: sr.official_master_slug || null,
                    is_main_role:         '0',
                    appointment_date:     sr.appointment_date     || null,
                    ceased_date:          sr.ceased_date          || null,
                    is_appt_proposed:     1,
                    is_ceased_proposed:   1,
                    appt_manual:          1,
                    ceased_manual:        sr.ceased_date ? 1 : 0,
                    remarks:              sr.remarks || null,
                }), { transaction: t });
            }

            // 2c. Controller record
            await this._upsertControllerRecord({
                models, t, now, userId,
                entity_id:          body.entity_id,
                official_entity_id: body.official_entity_id,
                official_type:      body.official_type || null,
                identification_id:  body.identification_id || null,
                controller_date:    body.controller_date || null,
            });

            // 2d. Joint / Sub Fund Umbrella member child rows
            if (['JOINT', 'SUB_FUND'].includes(body.official_type) && Array.isArray(body.joint_members)) {
                for (const m of body.joint_members) {
                    if (!m.entity_id) continue;
                    await models.officials.create({
                        entity_id:             body.entity_id,
                        official_entity_id:    m.entity_id,
                        reference_official_id: officialId,
                        is_ref_id:             1,
                        official_master_id:    body.official_master_id,
                        official_master_slug:  body.official_master_slug || null,
                        official_type:         m.member_type || null,
                        is_current:            1,
                        source_from:           'MANUAL',
                        is_deleted:            0,
                        created_date:          now,
                        created_by:            userId || null,
                        updated_date:          now,
                        updated_by:            userId || null,
                    }, { transaction: t });
                }
            }

            await t.commit();

        } catch (err) {
            if (t && !t.finished) await t.rollback().catch(() => {});
            logger.error('Create official error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error creating official'
            );
        }

        try {
            const result = await models.officials.findOne({
                where:   { official_id: officialId },
                include: this._withAssociations(models),
            });
            return responseHandler.returnSuccess(httpStatus.OK, 'Official created successfully', result);
        } catch {
            return responseHandler.returnSuccess(httpStatus.OK, 'Official created successfully', { official_id: officialId });
        }
    };

    // ── LIST ──────────────────────────────────────────────────────────────────

    list = async (query) => {
        try {

            const baseWhere = { is_deleted: 0 };
            if (query.entity_id)             baseWhere.entity_id             = query.entity_id;
            if (query.official_master_id)    baseWhere.official_master_id    = query.official_master_id;
            if (query.official_master_slug)  baseWhere.official_master_slug  = query.official_master_slug;
            if (query.reference_official_id) baseWhere.reference_official_id = query.reference_official_id;
            if (query.is_ref_id !== undefined && query.is_ref_id !== '') baseWhere.is_ref_id = Number(query.is_ref_id);
            if (query.is_current !== undefined) baseWhere.is_current = query.is_current;

            const where = buildCompleteWhere({
                query,
                searchFields: SEARCH_FIELDS,
                filterFields: FILTER_FIELDS,
                baseWhere,
            });

            const { page, limit, offset } = getPaginationParams(query, 15);
            const order = buildOrderClause(query.order, [['created_date', 'DESC']]);

            const models = getCurrentModels();
            const result = await models.officials.findAndCountAll({
                where,
                distinct: true,
                limit,
                offset,
                order,
                include: this._withAssociations(models),
            });

            if (result.count === 0) {
                return responseHandler.returnSuccess(
                    httpStatus.OK,
                    'No officials found',
                    { totalItems: 0, data: [], totalPages: 0, currentPage: page }
                );
            }

            return responseHandler.returnSuccess(
                httpStatus.OK,
                'Officials fetched successfully',
                responseHandler.getPaginationData(result, page, limit)
            );

        } catch (err) {
            logger.error('List officials error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error fetching officials'
            );
        }
    };

    // ── GET ───────────────────────────────────────────────────────────────────

    get = async (id) => {
        try {

            const models = getCurrentModels();
            const data   = await models.officials.findOne({
                where:   { official_id: id, is_deleted: 0 },
                include: this._withAssociations(models),
            });

            if (!data) {
                return responseHandler.returnError(httpStatus.NOT_FOUND, 'Official not found');
            }

            return responseHandler.returnSuccess(httpStatus.OK, 'Official fetched', data);

        } catch (err) {
            logger.error('Get official error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error fetching official'
            );
        }
    };

    // ── UPDATE ────────────────────────────────────────────────────────────────

    update = async (id, body, userId) => {

        const models = getCurrentModels();
        const t      = await models.sequelize.transaction();

        try {

            const existing = await models.officials.findOne({
                where: { official_id: id, is_deleted: 0 },
            });

            if (!existing) {
                await t.rollback();
                return responseHandler.returnError(httpStatus.NOT_FOUND, 'Official not found');
            }

            const now = new Date();

            // Contact: upsert before updating cs_officials so we have the id
            const resolvedContactId = await this._handleContactOnUpdate({
                entity_id:          existing.entity_id,
                official_entity_id: existing.official_entity_id,
                contact:            body.contact_details || null,
                userId,
                t,
            });

            // 1. cs_officials
            await models.officials.update({
                official_entity_id:        body.official_entity_id        ?? existing.official_entity_id,
                official_master_id:        body.official_master_id        ?? existing.official_master_id,
                official_master_slug:      body.official_master_slug      ?? existing.official_master_slug,
                official_type:             body.official_type             ?? existing.official_type,
                identification_id:         body.identification_id         ?? existing.identification_id,
                shareholder_type:          body.shareholder_type          ?? existing.shareholder_type,
                shareholder_property_type: body.shareholder_property_type ?? existing.shareholder_property_type,
                reference_official_id:     body.reference_official_id     ?? existing.reference_official_id,
                is_ref_id:                 body.is_ref_id                 ?? existing.is_ref_id,
                is_current:                body.is_current                ?? existing.is_current,
                // Only overwrite if the contact upsert returned something;
                // otherwise keep the previously linked contact_id untouched.
                company_contact_id:        resolvedContactId              ?? existing.company_contact_id,
                updated_date:              now,
                updated_by:                userId || null,
            }, { where: { official_id: id }, transaction: t });

            // 2a. Main date row (is_main_role = '1')
            const mainDate  = body.main_date || {};
            const mainRow   = await models.officials_date.findOne({
                where: { official_id: id, is_main_role: '1', is_deleted: 0 },
            });
            const mainPayload = {
                official_master_slug:  mainDate.official_master_slug  || existing.official_master_slug || null,
                is_main_role:          '1',
                appointment_date:      mainDate.appointment_date      || null,
                ceased_date:           mainDate.ceased_date           || null,
                is_appt_proposed:      mainDate.is_appt_proposed      ?? 1,
                is_ceased_proposed:    mainDate.is_ceased_proposed    ?? 1,
                officials_appt_from:   mainDate.officials_appt_from   || null,
                officials_ceased_from: mainDate.officials_ceased_from || null,
                appt_manual:           1,
                ceased_manual:         mainDate.ceased_date ? 1 : 0,
                remarks:               mainDate.remarks               || null,
                updated_date:          now,
                updated_by:            userId || null,
            };
            if (mainRow) {
                await models.officials_date.update(mainPayload,
                    { where: { official_date_id: mainRow.official_date_id }, transaction: t });
            } else {
                await models.officials_date.create({
                    entity_id:    existing.entity_id,
                    official_id:  id,
                    source_from:  'MANUAL',
                    is_deleted:   0,
                    created_date: now,
                    created_by:   userId || null,
                    ...mainPayload,
                }, { transaction: t });
            }

            // 2b. Sub-role date rows (is_main_role = '0')
            const existingSubRows = await models.officials_date.findAll({
                where: { official_id: id, is_main_role: '0', is_deleted: 0 },
                transaction: t,
            });

            const subRoleDates = Array.isArray(body.sub_role_dates) ? body.sub_role_dates : [];

            // Soft-delete rows not present in incoming payload
            const incomingIds = new Set(
                subRoleDates
                    .filter(sr => sr.official_date_id)
                    .map(sr => String(sr.official_date_id))
            );
            for (const row of existingSubRows) {
                if (!incomingIds.has(String(row.official_date_id))) {
                    await row.update({ is_deleted: 1, updated_date: now, updated_by: userId || null }, { transaction: t });
                }
            }

            const existingById = {};
            existingSubRows.forEach(r => { existingById[String(r.official_date_id)] = r; });

            for (const sr of subRoleDates) {
                const srPayload = {
                    official_master_slug: sr.official_master_slug || null,
                    is_main_role:         '0',
                    appointment_date:     sr.appointment_date     || null,
                    ceased_date:          sr.ceased_date          || null,
                    is_appt_proposed:     1,
                    is_ceased_proposed:   1,
                    appt_manual:          1,
                    ceased_manual:        sr.ceased_date ? 1 : 0,
                    remarks:              sr.remarks || null,
                    updated_date:         now,
                    updated_by:           userId || null,
                };
                if (sr.official_date_id) {
                    const existingSr = existingById[String(sr.official_date_id)];
                    if (existingSr) await existingSr.update(srPayload, { transaction: t });
                } else {
                    await models.officials_date.create({
                        entity_id:    existing.entity_id,
                        official_id:  id,
                        source_from:  'MANUAL',
                        is_deleted:   0,
                        created_date: now,
                        created_by:   userId || null,
                        ...srPayload,
                    }, { transaction: t });
                }
            }

            // 2c. Controller record
            await this._upsertControllerRecord({
                models, t, now, userId,
                entity_id:          existing.entity_id,
                official_entity_id: existing.official_entity_id,
                official_type:      existing.official_type,
                identification_id:  existing.identification_id,
                controller_date:    body.controller_date || null,
            });

            // 2d. Joint members — soft-delete old children then re-insert
            if (body.official_type === 'JOINT' && Array.isArray(body.joint_members)) {
                await models.officials.update(
                    { is_deleted: 1, updated_date: now, updated_by: userId || null },
                    { where: { reference_official_id: id, is_ref_id: 1, is_deleted: 0 }, transaction: t }
                );
                for (const m of body.joint_members) {
                    if (!m.entity_id) continue;
                    await models.officials.create({
                        entity_id:             existing.entity_id,
                        official_entity_id:    m.entity_id,
                        reference_official_id: id,
                        is_ref_id:             1,
                        official_master_id:    existing.official_master_id,
                        official_master_slug:  existing.official_master_slug || null,
                        official_type:         m.member_type || null,
                        is_current:            1,
                        source_from:           'MANUAL',
                        is_deleted:            0,
                        created_date:          now,
                        created_by:            userId || null,
                        updated_date:          now,
                        updated_by:            userId || null,
                    }, { transaction: t });
                }
            }

            await t.commit();

        } catch (err) {
            if (t && !t.finished) await t.rollback().catch(() => {});
            logger.error('Update official error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error updating official'
            );
        }

        try {
            const updated = await models.officials.findOne({
                where:   { official_id: id },
                include: this._withAssociations(models),
            });
            return responseHandler.returnSuccess(httpStatus.OK, 'Official updated successfully', updated);
        } catch {
            return responseHandler.returnSuccess(httpStatus.OK, 'Official updated successfully', { official_id: id });
        }
    };

    // ── CONTROLLER HELPERS ────────────────────────────────────────────────────

    _upsertControllerRecord = async ({ models, t, now, userId, entity_id, official_entity_id, official_type, identification_id, controller_date }) => {
        if (!controller_date) return;

        let ctrlMaster = null;
        const passedId = controller_date.official_master_id ? Number(controller_date.official_master_id) : null;

        if (passedId) {
            ctrlMaster = await models.official_master.findOne({ where: { official_master_id: passedId } });
            logger.info(`[Controller] ID lookup (${passedId}): ${ctrlMaster ? 'found' : 'not found'}`);
        }
        if (!ctrlMaster) {
            ctrlMaster = await models.official_master.findOne({ where: { official_master_slug: CONTROLLER_SLUG } });
            logger.info(`[Controller] slug lookup ('${CONTROLLER_SLUG}'): ${ctrlMaster ? 'found' : 'not found'}`);
        }
        if (!ctrlMaster) {
            const allMasters = await models.official_master.findAll({
                where:      { is_parent: 0 },
                attributes: ['official_master_id', 'official_master_slug', 'official_master_name'],
            });
            ctrlMaster = allMasters.find(m =>
                m.official_master_name?.toLowerCase().includes('controller') ||
                m.official_master_slug?.toLowerCase().includes('controller')
            ) || null;
            logger.info(`[Controller] name/slug fallback: ${ctrlMaster ? `found id=${ctrlMaster.official_master_id}` : 'not found'}`);
        }
        if (!ctrlMaster) {
            logger.warn(`[Controller] Could not find official_master for Controller — skipping.`);
            return;
        }

        const ctrl_master_id = ctrlMaster.official_master_id;
        const ctrlSlug       = ctrlMaster.official_master_slug;

        let ctrlOff = await models.officials.findOne({
            where: { entity_id, official_entity_id, official_master_id: ctrl_master_id, is_deleted: 0 },
        });
        if (!ctrlOff) {
            ctrlOff = await models.officials.create({
                entity_id,
                official_entity_id,
                official_master_id:   ctrl_master_id,
                official_master_slug: ctrlSlug,
                official_type:        official_type || null,
                identification_id:    identification_id || null,
                is_current:           1,
                source_from:          'MANUAL',
                is_deleted:           0,
                created_date:         now,
                created_by:           userId || null,
                updated_date:         now,
                updated_by:           userId || null,
            }, { transaction: t });
        }

        const existingDate = await models.officials_date.findOne({
            where: { official_id: ctrlOff.official_id, is_main_role: '1', is_deleted: 0 },
        });
        const datePayload = {
            official_master_slug: ctrlSlug,
            is_main_role:         '1',
            appointment_date:     controller_date.appointment_date || null,
            ceased_date:          controller_date.ceased_date      || null,
            is_appt_proposed:     1,
            is_ceased_proposed:   1,
            appt_manual:          1,
            ceased_manual:        controller_date.ceased_date ? 1 : 0,
            updated_date:         now,
            updated_by:           userId || null,
        };
        if (existingDate) {
            await existingDate.update(datePayload, { transaction: t });
        } else {
            await models.officials_date.create({
                entity_id,
                official_id:  ctrlOff.official_id,
                source_from:  'MANUAL',
                is_deleted:   0,
                created_date: now,
                created_by:   userId || null,
                ...datePayload,
            }, { transaction: t });
        }
    };

    getControllerDates = async (entity_id, official_entity_id, controller_master_id) => {
        try {
            const models = getCurrentModels();

            const _parsedId = parseInt(controller_master_id, 10);
            let resolvedMasterId = (!controller_master_id || isNaN(_parsedId)) ? null : _parsedId;
            if (!resolvedMasterId) {
                let m = await models.official_master.findOne({ where: { official_master_slug: CONTROLLER_SLUG } });
                if (!m) {
                    const all = await models.official_master.findAll({
                        where: { is_parent: 0 },
                        attributes: ['official_master_id', 'official_master_slug', 'official_master_name'],
                    });
                    m = all.find(r =>
                        r.official_master_name?.toLowerCase().includes('controller') ||
                        r.official_master_slug?.toLowerCase().includes('controller')
                    ) || null;
                }
                if (m) resolvedMasterId = m.official_master_id;
            }

            const where = { entity_id, official_entity_id, is_deleted: 0 };
            if (resolvedMasterId) {
                where.official_master_id = resolvedMasterId;
            } else {
                where.official_master_slug = CONTROLLER_SLUG;
            }

            const ctrlOff = await models.officials.findOne({
                where,
                include: [{
                    model:    models.officials_date,
                    as:       'date_records',
                    required: false,
                    where:    { is_main_role: '1', is_deleted: 0 },
                }],
            });

            if (!ctrlOff) {
                return responseHandler.returnSuccess(httpStatus.OK, 'No controller record found', null);
            }

            const rec = (ctrlOff.date_records || [])[0] || null;
            return responseHandler.returnSuccess(httpStatus.OK, 'Controller dates fetched', rec ? {
                appointment_date:   rec.appointment_date,
                ceased_date:        rec.ceased_date,
                is_appt_proposed:   rec.is_appt_proposed,
                is_ceased_proposed: rec.is_ceased_proposed,
            } : null);

        } catch (err) {
            logger.error('Get controller dates error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error fetching controller dates'
            );
        }
    };

    // ── DELETE (soft) ─────────────────────────────────────────────────────────

    delete = async (id, userId) => {

        const models = getCurrentModels();
        const t      = await models.sequelize.transaction();

        try {

            const existing = await models.officials.findOne({
                where: { official_id: id, is_deleted: 0 },
            });

            if (!existing) {
                await t.rollback();
                return responseHandler.returnError(httpStatus.NOT_FOUND, 'Official not found');
            }

            const now     = new Date();
            const payload = { is_deleted: 1, updated_date: now, updated_by: userId || null };

            await models.officials.update(payload,              { where: { official_id: id }, transaction: t });
            await models.officials_date.update(payload,         { where: { official_id: id }, transaction: t });
            await models.official_representaive.update(payload, { where: { official_id: id }, transaction: t });

            await t.commit();

            return responseHandler.returnSuccess(httpStatus.OK, 'Official deleted successfully');

        } catch (err) {
            await t.rollback();
            logger.error('Delete official error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error deleting official'
            );
        }
    };
}

module.exports = OfficialService;
