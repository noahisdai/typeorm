import { Column } from "../../../../../src/decorator/columns/Column"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"

@Entity("mariadb_timestamp_precision")
export class MariadbTimestampPrecision {
    @PrimaryColumn()
    id: number

    @Column({
        type: "datetime",
        precision: 3,
        default: () => "CURRENT_TIMESTAMP(3)",
        onUpdate: "CURRENT_TIMESTAMP(6)",
        dialectTypes: { mariadb: "datetime(6)" },
    })
    changedAt: Date
}
