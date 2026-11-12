exports.up = async function (knex) {
  await knex.schema.createTable('items', (table) => {
    table.increments('id');
    table.string('sku', 40).notNullable().unique();
    table.integer('customer_id').unsigned().references('id').inTable('customers');
    table.decimal('price', 8, 2).defaultTo(0);
    table.timestamps(true, true);
  });
  await knex.schema.alterTable('customers', (t) => {
    t.string('phone');
  });
};
exports.down = (knex) => knex.schema.dropTable('items');
