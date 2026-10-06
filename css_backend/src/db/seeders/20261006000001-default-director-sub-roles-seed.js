'use strict';

const table = require('../../helper/dbTable');

// Default sub roles under "Directors". Seeded with is_default = 1 so they
// cannot be deleted or renamed; users can still add their own sub roles.

const DIRECTOR_SUB_ROLES = [
    { name: 'Managing Director',                            slug: 'managing-director' },
    { name: 'Nominee Director',                             slug: 'nominee-director' },
    { name: 'Alternate / Substitute Director',              slug: 'alternate-substitute-director' },
    { name: 'Executive/Non-independent Director',           slug: 'executive-non-independent-director' },
    { name: 'Non-executive/Independent Director',           slug: 'non-executive-independent-director' },
    { name: 'Associate Director',                           slug: 'associate-director' },
    { name: 'Chief Executive Officer/Chief Executive (CEO)', slug: 'chief-executive-officer-chief-executive-ceo' },
    { name: 'Chairman',                                     slug: 'chairman' },
    { name: 'Executive Chairman',                           slug: 'executive-chairman' },
    { name: 'Non Executive Chairman',                       slug: 'non-executive-chairman' },
    { name: 'Chief Financial Officer (CFO)',                slug: 'chief-financial-officer-cfo' },
    { name: 'Chief Operating Officer (COO)',                slug: 'chief-operating-officer-coo' },
    { name: 'President Director',                           slug: 'president-director' },
    { name: 'Representative Director',                      slug: 'representative-director' },
];

module.exports = {

    up: async (queryInterface) => {
        const [parents] = await queryInterface.sequelize.query(
            `SELECT official_master_id FROM ${table('official_master')} WHERE official_master_slug = 'directors' LIMIT 1`
        );
        if (!parents.length) throw new Error('Parent official "directors" not found — run the official master seed first');
        const directorsId = parents[0].official_master_id;

        await queryInterface.bulkInsert(
            table('official_master'),
            DIRECTOR_SUB_ROLES.map((r, i) => ({
                official_master_name: r.name,
                official_master_slug: r.slug,
                official_order:       i + 1,
                is_parent:            directorsId,
                is_default:           1,
                is_representative:    0,
                is_entity_type:       'ALL',
                is_show:              1,
                is_active:            0,
                is_deleted:           0,
                updated_date:         '2026-10-06 00:00:00',
                updated_by:           1,
            })),
            { ignoreDuplicates: true }
        );

        // Rows that already existed (ignored above) still get flagged as default
        await queryInterface.bulkUpdate(
            table('official_master'),
            { is_default: 1 },
            { official_master_slug: DIRECTOR_SUB_ROLES.map(r => r.slug) }
        );
    },

    down: async (queryInterface) => {
        await queryInterface.bulkDelete(
            table('official_master'),
            { official_master_slug: DIRECTOR_SUB_ROLES.map(r => r.slug), is_default: 1 }
        );
    },
};
