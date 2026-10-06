const httpStatus = require('http-status');

const { Op } = require('sequelize');

const OfficialMasterDao =
    require('../../dao/masterSettings/OfficialMasterDao');

const generateUniqueSlug =
    require('../../helper/generateUniqueSlug');

const responseHandler =
    require('../../helper/responseHandler');

const logger = require('../../config/logger');

const {
    buildCompleteWhere,
    buildOrderClause,
    getPaginationParams,
} = require('../../helper/searchHelper');

const SEARCH_FIELDS = [
    'official_master_name',
    'official_master_slug'
];

const FILTER_FIELDS = [
    'official_master_name'
];

/**
 * OfficialSubRoleService
 * ──────────────────────
 * Operates on the same `official_master` table but scoped to records
 * where is_parent != 0  (i.e. sub-roles assigned under a parent official).
 */
class OfficialSubRoleService {

    constructor() {
        this.officialMasterDao = new OfficialMasterDao();
    }

    async _checkExists(id) {
        // ✅ Do NOT filter by is_deleted — status can be active or inactive.
        //    The update endpoint is also used by OfficialMaster Config to
        //    flip is_deleted, so we must be able to find inactive rows too.
        return await this.officialMasterDao.findOneByWhere({
            official_master_id: id,
            is_parent: { [Op.ne]: 0 },
        });
    }

    // ── List (is_parent != 0) ──────────────────────────────────
    list = async (query) => {
        try {

            // ✅ fetch_all=1 → include inactive (is_deleted=1) rows
            const baseWhere = query.fetch_all === '1' || query.fetch_all === 1
                ? { is_parent: { [Op.ne]: 0 } }
                : { is_deleted: false, is_parent: { [Op.ne]: 0 } };

            const where = buildCompleteWhere({
                query,
                searchFields: SEARCH_FIELDS,
                filterFields: FILTER_FIELDS,
                baseWhere,
            });

            const { page, limit, offset } = getPaginationParams(query, 10);

            const order = buildOrderClause(
                query.order,
                [['official_order', 'ASC']]
            );

            const result = await this.officialMasterDao.findAndCountAll({
                where,
                limit,
                offset,
                order,
            });

            if (result.count === 0) {
                return responseHandler.returnSuccess(
                    httpStatus.OK,
                    'No official sub roles found',
                    { totalItems: 0, data: [], totalPages: 0, currentPage: page }
                );
            }

            let paginationData = responseHandler.getPaginationData(result, page, limit);

            // Auto order number
            const getLastRecord = await this.officialMasterDao.findOneByWhere(
                {
                    is_deleted: false,
                    is_parent: { [Op.ne]: 0 },
                },
                ['official_master_id'],
                [['official_master_id', 'DESC']]
            );

            paginationData.auto_order_number = getLastRecord
                ? getLastRecord.official_master_id + 1
                : 1;

            return responseHandler.returnSuccess(
                httpStatus.OK,
                'Official sub role list fetched successfully',
                paginationData
            );

        } catch (err) {
            logger.error('List official sub role error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error fetching official sub role list'
            );
        }
    };

    // ── Create ─────────────────────────────────────────────────
    create = async (body) => {
        try {

            if (!body.is_parent || Number(body.is_parent) === 0) {
                return responseHandler.returnError(
                    httpStatus.BAD_REQUEST,
                    'A valid parent official is required for a sub role'
                );
            }

            const existing = await this.officialMasterDao.findOneByWhere({
                official_master_name: body.official_master_name,
                is_parent: body.is_parent,
                is_deleted: false,
            });

            if (existing) {
                return responseHandler.returnError(
                    httpStatus.BAD_REQUEST,
                    'Official sub role already exists under this parent'
                );
            }

            body.official_master_slug = await generateUniqueSlug(
                this.officialMasterDao.Model,
                body.official_master_name,
                'official_master_slug',
                'official_master_id'
            );

            body.is_deleted    = false;
            body.is_default    = 0;
            body.updated_date  = new Date();

            const data = await this.officialMasterDao.create(body);

            return responseHandler.returnSuccess(
                httpStatus.OK,
                'Official sub role created successfully',
                data
            );

        } catch (err) {
            logger.error('Create official sub role error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error creating official sub role'
            );
        }
    };

    // ── Get ────────────────────────────────────────────────────
    get = async (id) => {
        try {

            const data = await this._checkExists(id);
            if (!data) {
                return responseHandler.returnError(
                    httpStatus.BAD_REQUEST,
                    'Official sub role not found'
                );
            }

            return responseHandler.returnSuccess(
                httpStatus.OK,
                'Official sub role fetched successfully',
                data
            );

        } catch (err) {
            logger.error('Get official sub role error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error fetching official sub role'
            );
        }
    };

    // ── Update ─────────────────────────────────────────────────
    update = async (id, body) => {
        try {

            const oldData = await this._checkExists(id);
            if (!oldData) {
                return responseHandler.returnError(
                    httpStatus.BAD_REQUEST,
                    'Official sub role not found'
                );
            }

            // Default sub roles: name, slug and parent are fixed (dates reference the slug)
            if (oldData.is_default) {
                if (body.official_master_name && body.official_master_name !== oldData.official_master_name) {
                    return responseHandler.returnError(
                        httpStatus.BAD_REQUEST,
                        'Default sub roles cannot be renamed'
                    );
                }
                delete body.official_master_slug;
                delete body.is_parent;
            }
            delete body.is_default;

            if (
                body.official_master_name &&
                body.official_master_name !== oldData.official_master_name
            ) {
                const exists = await this.officialMasterDao.findOneByWhere({
                    official_master_name: body.official_master_name,
                    is_parent: body.is_parent || oldData.is_parent,
                    is_deleted: false,
                    official_master_id: { [Op.ne]: id },
                });

                if (exists) {
                    return responseHandler.returnError(
                        httpStatus.BAD_REQUEST,
                        'Official sub role already exists under this parent'
                    );
                }

                body.official_master_slug = await generateUniqueSlug(
                    this.officialMasterDao.Model,
                    body.official_master_name,
                    'official_master_slug',
                    'official_master_id',
                    id
                );
            }

            await this.officialMasterDao.updateWhere(
                { ...body, updated_date: new Date() },
                { official_master_id: id }
            );

            const updatedData = await this.officialMasterDao.findOneByWhere({
                official_master_id: id,
            });

            return responseHandler.returnSuccess(
                httpStatus.OK,
                'Official sub role updated successfully',
                updatedData
            );

        } catch (err) {
            logger.error('Update official sub role error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error updating official sub role'
            );
        }
    };

    // ── Delete (soft) ──────────────────────────────────────────
    delete = async (id) => {
        try {

            const oldData = await this._checkExists(id);
            if (!oldData) {
                return responseHandler.returnError(
                    httpStatus.BAD_REQUEST,
                    'Official sub role not found'
                );
            }

            if (oldData.is_default) {
                return responseHandler.returnError(
                    httpStatus.BAD_REQUEST,
                    'Default sub roles cannot be deleted'
                );
            }

            await this.officialMasterDao.updateWhere(
                { is_deleted: true, updated_date: new Date() },
                { official_master_id: id }
            );

            return responseHandler.returnSuccess(
                httpStatus.OK,
                'Official sub role deleted successfully'
            );

        } catch (err) {
            logger.error('Delete official sub role error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error deleting official sub role'
            );
        }
    };

     // ── Get next auto order number for a given parent ──────────────
    getNextOrderByParent = async (parentId) => {
        try {
            
            if (!parentId || Number(parentId) === 0) {
                return responseHandler.returnError(
                    httpStatus.BAD_REQUEST,
                    'A valid parent official ID is required'
                );
            }

            // Count all sub-roles under this parent (active + inactive, not hard-deleted)
            const count = await this.officialMasterDao.getCountByWhere({
                is_parent:  Number(parentId),
                is_deleted: false,
            });

            const nextOrder = count + 1;

            return responseHandler.returnSuccess(
                httpStatus.OK,
                'Next order number fetched successfully',
                { next_order: nextOrder, parent_id: Number(parentId), existing_count: count }
            );

        } catch (err) {
            logger.error('Get next order by parent error:', err);
            return responseHandler.returnError(
                httpStatus.INTERNAL_SERVER_ERROR,
                err.message || 'Error fetching next order number'
            );
        }
    };

}

module.exports = OfficialSubRoleService;