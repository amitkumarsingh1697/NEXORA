import { Model } from 'objection';
export class Pet extends Model {
  static tableName = 'pets';
}
export class Toy extends Model {
  static get tableName() {
    return 'toys';
  }
}
