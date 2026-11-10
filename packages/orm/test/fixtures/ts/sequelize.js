const { DataTypes, Model } = require('sequelize');

const Customer = sequelize.define('Customer', {
  email: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  name: DataTypes.STRING,
}, { underscored: true });

class Invoice extends Model {}
Invoice.init({
  number: { type: DataTypes.STRING, primaryKey: true },
  customerId: { type: DataTypes.INTEGER, references: { model: 'Customers', key: 'id' } },
}, { sequelize, tableName: 'invoices', timestamps: false });
