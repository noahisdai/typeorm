import { Column } from "../../../../../src/decorator/columns/Column"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"

@Entity("mysql_numeric_default")
export class MysqlNumericDefault {
    @PrimaryColumn()
    id: number

    @Column({
        type: "decimal",
        precision: 4,
        scale: 2,
        default: 1.23,
        dialectTypes: { mysql: "varchar(10)", mariadb: "varchar(10)" },
    })
    amount: string
}
