'use strict';

const { Model } = require('sequelize');
const table = require('../../helper/dbTable');

module.exports = (sequelize, DataTypes) => {

    class OfficialMaster extends Model {

        static associate(models) {
            // no association
        }

    }

    OfficialMaster.init(
        {

            official_master_id: {
                type: DataTypes.SMALLINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },

            official_master_name: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },

            official_master_slug: {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true,
            },

            official_order: {
                type: DataTypes.SMALLINT.UNSIGNED,
                allowNull: false,
                defaultValue: 0,
            },

            is_representative :{
                type: DataTypes.TINYINT.UNSIGNED,
                allowNull: false,
                defaultValue: 0,
                
            }, is_entity_type : {
                type: DataTypes.ENUM(
                    'COMPANY',
                    'INDIVIDUAL',
                    'ALL'
                ),
                allowNull: false,
                defaultValue: 'ALL',

            }, is_parent : {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0,
                comment: '0 = No, 1 = Yes',
            },
            is_default: {
                type: DataTypes.TINYINT(1),
                allowNull: false,
                defaultValue: 0,
                comment: '1 = system default sub role (not deletable / renameable)',
            },
             is_active : {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0,
            },

            is_deleted: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },

            is_show: {
                type: DataTypes.TINYINT(1),
                allowNull: false,
                defaultValue: 1,
            },

            parent_slugs: {
                type: DataTypes.STRING(500),
                allowNull: true,
            },

            updated_date: {
                type: DataTypes.DATE,
                allowNull: true,
            },

            updated_by: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true,
            },

        },
        {
            sequelize,

            modelName: 'official_master',

            tableName: table('official_master'),

            timestamps: false,

            createdAt: false,

            updatedAt: 'updated_date',

            underscored: true,

            indexes: [
                {
                    unique: true,
                    fields: ['official_master_slug'],
                    name: 'uq_official_slug',
                },
                {
                    fields: ['official_master_type'],
                    name: 'idx_official_master_type',
                },
                {
                    fields: ['is_deleted'],
                    name: 'idx_official_master_deleted',
                },
            ],
        }
    );

    return OfficialMaster;
};