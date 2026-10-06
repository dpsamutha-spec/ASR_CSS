'use strict';

const table = require('../../helper/dbTable');

// is_default = 1 marks system-seeded sub roles (e.g. the default Director sub roles):
// they cannot be deleted or renamed — only order / status can change.

module.exports = {

    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(table('official_master'), 'is_default', {
            type:         Sequelize.TINYINT(1),
            allowNull:    false,
            defaultValue: 0,
            after:        'is_parent',
            comment:      '1 = system default (not deletable / renameable)',
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn(table('official_master'), 'is_default');
    },

};
