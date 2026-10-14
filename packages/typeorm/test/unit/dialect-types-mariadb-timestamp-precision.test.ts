import "reflect-metadata"
import { expect } from "chai"
import { DataSource } from "../../src/data-source/DataSource"
import { EntitySchema } from "../../src/entity-schema/EntitySchema"
import type { EntitySchemaColumnOptions } from "../../src/entity-schema/EntitySchemaColumnOptions"
import { TableUtils } from "../../src/schema-builder/util/TableUtils"
import { TableColumn } from "../../src/schema-builder/table/TableColumn"

class MetadataOnlyDataSource extends DataSource {
    prepareMetadata() {
        return this.buildMetadatas()
    }
}

async function fixture(
    engine: "mariadb" | "mysql",
    options: EntitySchemaColumnOptions,
) {
    const entity = new EntitySchema({
        name: "TimestampPrecisionOverride",
        columns: { id: { type: Number, primary: true }, value: options },
    })
    // A client stub and metadata-only setup prevent any network connection.
    const dataSource = new MetadataOnlyDataSource({
        type: engine,
        database: "test",
        driver: {},
        entities: [entity],
    })
    await dataSource.prepareMetadata()
    const column = dataSource
        .getMetadata(entity)
        .findColumnWithPropertyName("value")!
    expect(dataSource.isInitialized).to.equal(false)
    return new TableColumn(
        TableUtils.createTableColumnOptions(column, dataSource.driver),
    )
}

async function failure(
    engine: "mariadb" | "mysql",
    options: EntitySchemaColumnOptions,
) {
    try {
        await fixture(engine, options)
    } catch (error) {
        return error as Error
    }
    return undefined
}

// Regression coverage for the MariaDB timestamp precision review on PR #12884 (issue #12874).
describe("ColumnMetadata > dialect type MariaDB timestamp precision", () => {
    it("rejects an ON UPDATE less precise than the column", async () => {
        const error = await failure("mariadb", {
            type: "datetime",
            precision: 3,
            onUpdate: "CURRENT_TIMESTAMP(3)",
            dialectTypes: { mariadb: "datetime(6)" },
        })
        expect(error).to.be.instanceOf(Error)
        expect(error!.message).to.contain(
            "ON UPDATE CURRENT_TIMESTAMP precision must match",
        )
    })

    it("rejects an ON UPDATE more precise than the column", async () => {
        const error = await failure("mariadb", {
            type: "datetime",
            precision: 6,
            onUpdate: "CURRENT_TIMESTAMP(6)",
            dialectTypes: { mariadb: "datetime(3)" },
        })
        expect(error).to.be.instanceOf(Error)
        expect(error!.message).to.contain(
            "ON UPDATE CURRENT_TIMESTAMP precision must match",
        )
    })

    it("accepts a matching ON UPDATE", async () => {
        const column = await fixture("mariadb", {
            type: "datetime",
            precision: 6,
            onUpdate: "CURRENT_TIMESTAMP(3)",
            dialectTypes: { mariadb: "datetime(3)" },
        })
        expect(column.onUpdate).to.equal("CURRENT_TIMESTAMP(3)")
    })

    for (const type of ["datetime", "timestamp"]) {
        it(`rejects a ${type} DEFAULT more precise than the column`, async () => {
            const error = await failure("mariadb", {
                type: "datetime",
                precision: 6,
                default: () => "CURRENT_TIMESTAMP(6)",
                dialectTypes: { mariadb: `${type}(3)` },
            })
            expect(error).to.be.instanceOf(Error)
            expect(error!.message).to.contain(
                "DEFAULT CURRENT_TIMESTAMP precision must not exceed",
            )
        })
    }

    it("accepts a DEFAULT less precise than the column", async () => {
        const column = await fixture("mariadb", {
            type: "datetime",
            precision: 3,
            default: () => "CURRENT_TIMESTAMP(3)",
            dialectTypes: { mariadb: "datetime(6)" },
        })
        expect(column.default).to.equal("CURRENT_TIMESTAMP(3)")
        expect(column.precision).to.equal(6)
    })

    it("accepts a matching DEFAULT", async () => {
        const column = await fixture("mariadb", {
            type: "datetime",
            precision: 6,
            default: () => "CURRENT_TIMESTAMP(3)",
            dialectTypes: { mariadb: "datetime(3)" },
        })
        expect(column.default).to.equal("CURRENT_TIMESTAMP(3)")
    })

    it("keeps the exact DEFAULT precision rule on MySQL", async () => {
        const error = await failure("mysql", {
            type: "datetime",
            precision: 3,
            default: () => "CURRENT_TIMESTAMP(3)",
            dialectTypes: { mysql: "datetime(6)" },
        })
        expect(error).to.be.instanceOf(Error)
        expect(error!.message).to.contain(
            "DEFAULT CURRENT_TIMESTAMP precision must match",
        )
    })
})
