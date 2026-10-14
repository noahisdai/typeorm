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
    engine: "mysql" | "mariadb",
    options: EntitySchemaColumnOptions,
) {
    const entity = new EntitySchema({
        name: "NumericDefaultOverride",
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
    const physical = column.resolveDriverColumn(dataSource.driver)
    const tableColumn = new TableColumn(
        TableUtils.createTableColumnOptions(column, dataSource.driver),
    )
    expect(dataSource.isInitialized).to.equal(false)
    return { dataSource, column, physical, tableColumn }
}

// Regression coverage for the MySQL numeric default review on PR #12884 (issue #12874).
describe("ColumnMetadata > dialect type MySQL numeric defaults", () => {
    for (const engine of ["mysql", "mariadb"] as const) {
        for (const override of ["varchar(10)", "varchar", "text"]) {
            it(`${engine} keeps decimal digits of a default overridden to ${override}`, async () => {
                const f = await fixture(engine, {
                    type: "decimal",
                    precision: 4,
                    scale: 2,
                    default: 1.23,
                    dialectTypes: { [engine]: override },
                })
                expect(f.tableColumn.default).to.equal("'1.23'")
                expect(f.column.default).to.equal(1.23)
                expect(f.column.scale).to.equal(2)
                expect(
                    f.dataSource.driver.findChangedColumns(
                        [f.tableColumn],
                        [f.physical],
                    ),
                ).to.be.empty
            })
        }
        it(`${engine} rounds the default for an integer override`, async () => {
            const f = await fixture(engine, {
                type: "decimal",
                precision: 4,
                scale: 2,
                default: 1.23,
                dialectTypes: { [engine]: "int" },
            })
            expect(f.tableColumn.default).to.equal("'1'")
        })
        it(`${engine} formats the default with a scale-bearing override`, async () => {
            const f = await fixture(engine, {
                type: "decimal",
                precision: 4,
                scale: 2,
                default: 1.23,
                dialectTypes: { [engine]: "decimal(10,4)" },
            })
            expect(f.tableColumn.default).to.equal("'1.2300'")
        })
        it(`${engine} leaves numeric defaults without an override unchanged`, async () => {
            const f = await fixture(engine, {
                type: "decimal",
                precision: 4,
                scale: 2,
                default: 1.23,
            })
            expect(f.physical).to.equal(f.column)
            expect(f.tableColumn.default).to.equal("'1.23'")
        })
    }
})
