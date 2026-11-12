import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, ManyToMany, JoinTable, CreateDateColumn } from 'typeorm';

@Entity()
export class UserAccount {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 254, unique: true })
  email!: string;

  @Column({ name: 'display_name', nullable: true })
  displayName?: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  balance!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => Photo, (p) => p.owner)
  photos!: Photo[];

  @ManyToMany(() => Group)
  @JoinTable()
  groups!: Group[];
}

@Entity('photos')
export class Photo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => UserAccount, (u) => u.photos, { nullable: false })
  owner!: UserAccount;

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'group_ref' })
  group!: Group;
}

@Entity({ name: 'groups' })
export class Group {
  @PrimaryGeneratedColumn()
  id!: number;
}
