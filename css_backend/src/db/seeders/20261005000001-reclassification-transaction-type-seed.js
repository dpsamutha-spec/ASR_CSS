'use strict';

const table = require('../../helper/dbTable');

// Adds the company-level "Reclassification" transaction type (moves a cert to another share class)

module.exports = {

  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert(
      table('transaction_type'),
      [{
        t_id:         19,
        t_type:       '1',
        t_name:       'Reclassification',
        t_slug:       'reclassification',
        t_order:      19,
        t_type_no:    null,
        t_type_color: '#8e44ad',
        is_deleted:   0,
        updated_date: '2026-10-05 00:00:00',
        updated_by:   1,
      }],
      { ignoreDuplicates: true }
    );
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete(
      table('transaction_type'),
      { t_slug: 'reclassification' }
    );
  },
};
