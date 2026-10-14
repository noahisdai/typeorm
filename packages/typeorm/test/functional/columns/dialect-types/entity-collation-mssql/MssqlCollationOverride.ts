import { Column } from "../../../../../src/decorator/columns/Column"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"

@Entity("mssql_collation_override")
export class MssqlCollationOverride {
    @PrimaryColumn()
    id: number

    @Column({
        type: "varchar",
        length: 40,
        collation: "Latin1_General_CI_AS",
        nullable: true,
        dialectTypes: { mssql: "int" },
    })
    numericValue: number | null

    @Column({
        type: "varchar",
        length: 40,
        collation: "Latin1_General_CI_AS",
        nullable: true,
        dialectTypes: { mssql: "nvarchar(40)" },
    })
    textValue: string | null
}
