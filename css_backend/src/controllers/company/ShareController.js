'use strict';

const httpStatus     = require('http-status');
const ShareService   = require('../../service/company/ShareService');
const logger         = require('../../config/logger');

class ShareController {
    constructor() {
        this.service = new ShareService();
    }

    createAllotment = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.createAllotment(req.body, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    list = async (req, res) => {
        try {
            const result = await this.service.listByEntity({
                ...req.query,
                entity_id: req.params.entity_id,
            });
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    get = async (req, res) => {
        try {
            const result = await this.service.get(req.params.id);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    delete = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.delete(req.params.id, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    createTransfer = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.createTransfer(req.body, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    retainShare = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.retainShare(req.params.id, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    createClubTransfer = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.createClubTransfer(req.body, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    retainClubTransfer = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.retainClubTransfer(req.params.id, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    createDissolve = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.createDissolve(req.body, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    retainDissolve = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.retainDissolve(req.params.id, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    retainBuyback = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.retainBuyback(req.params.id, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    createCancel = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.createCancel(req.body, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    createReplacement = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.createReplacement(req.body, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    retainReplacement = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.retainReplacement(req.params.id, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    createSplit = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.createSplit(req.body, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    createCombine = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.createCombine(req.body, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    retainCombine = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.retainCombine(req.params.id, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    createReclassification = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.createReclassification(req.body, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    retainReclassification = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.retainReclassification(req.params.id, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    checkFolioNo = async (req, res) => {
        try {
            const result = await this.service.checkFolioNo({
                entity_id: req.query.entity_id,
                folio_no:  req.query.folio_no,
            });
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    retainSplit = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.retainSplit(req.params.id, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    listCompatibleReplacementCerts = async (req, res) => {
        try {
            const result = await this.service.listCompatibleReplacementCerts({
                entity_id:     req.query.entity_id,
                source_txn_id: req.query.source_txn_id,
            });
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    checkReplacementCert = async (req, res) => {
        try {
            const result = await this.service.checkReplacementCert({
                entity_id:     req.query.entity_id,
                cert_no:       req.query.cert_no,
                source_txn_id: req.query.source_txn_id,
            });
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    createBuyback = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            const result = await this.service.createBuyback(req.body, userId);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    shareholderHistory = async (req, res) => {
        try {
            const result = await this.service.shareholderHistory(
                req.params.official_entity_id,
                req.query.entity_id,
            );
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };

    companyShareSummary = async (req, res) => {
        try {
            const result = await this.service.companyShareSummary(req.query.entity_ids);
            res.status(result.statusCode).send(result.response);
        } catch (e) {
            logger.error(e);
            res.status(httpStatus.BAD_GATEWAY).send(e);
        }
    };
}

module.exports = ShareController;
