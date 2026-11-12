module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Orders', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      customerId: { type: Sequelize.INTEGER, references: { model: 'Customers', key: 'id' } },
      createdAt: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.addColumn('Orders', 'note', { type: Sequelize.TEXT });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('Orders');
  },
};
