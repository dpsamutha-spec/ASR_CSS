'use strict';

const table = require('../../helper/dbTable');

// "Alternate Director To" — sub-official of a director (like Proxy / Nominator):
// links a director holding the "Alternate / Substitute Director" sub role to the
// principal director (another director of the same company) they stand in for.
// is_show = 0 + parent_slugs = 'directors' makes it appear in the director's ⋮ menu.

module.exports = {

    up: async (queryInterface) => {
        const [rows] = await queryInterface.sequelize.query(
            `SELECT COALESCE(MAX(official_order), 0) AS max_order FROM ${table('official_master')} WHERE is_parent = 0`
        );
        await queryInterface.bulkInsert(
            table('official_master'),
            [{
                official_master_name: 'Alternate Director To',
                official_master_slug: 'alternate-director-to',
                official_order:       Number(rows[0].max_order) + 1,
                is_parent:            0,
                is_default:           1,
                is_representative:    0,
                is_entity_type:       'ALL',
                is_show:              0,
                parent_slugs:         'directors',
                is_active:            0,
                is_deleted:           0,
                updated_date:         '2026-10-06 00:00:00',
                updated_by:           1,
            }],
            { ignoreDuplicates: true }
        );
    },

    down: async (queryInterface) => {
        await queryInterface.bulkDelete(
            table('official_master'),
            { official_master_slug: 'alternate-director-to' }
        );
    },
};
