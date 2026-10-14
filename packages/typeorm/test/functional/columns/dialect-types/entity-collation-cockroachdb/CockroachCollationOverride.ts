import { Column } from "../../../../../src/decorator/columns/Column"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"

@Entity("cockroach_collation_override")
export class CockroachCollationOverride {
    @PrimaryColumn()
    id: number

    @Column({
        type: "varchar",
        length: 40,
        collation: "en_US",
        nullable: true,
        dialectTypes: { cockroachdb: "int8" },
    })
    numericValue: string | null

    @Column({
        type: "varchar",
        length: 40,
        collation: "en_US",
        nullable: true,
        dialectTypes: { cockroachdb: "string" },
    })
    textValue: string | null
}
