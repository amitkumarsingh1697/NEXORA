import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity()
export class BookCopy {
  @PrimaryKey()
  id!: number;

  @Property({ length: 200 })
  fullTitle!: string;

  @Property({ nullable: true })
  isbnCode?: string;

  @ManyToOne(() => BookCopy)
  originalCopy?: BookCopy;
}
