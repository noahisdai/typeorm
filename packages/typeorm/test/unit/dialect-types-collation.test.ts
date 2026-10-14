import "reflect-metadata"
import { expect } from "chai"
import { DataSource } from "../../src/data-source/DataSource"
import { EntitySchema } from "../../src/entity-schema/EntitySchema"
import type { EntitySchemaColumnOptions } from "../../src/entity-schema/EntitySchemaColumnOptions"
import { TableUtils } from "../../src/schema-builder/util/TableUtils"
import { TableColumn } from "../../src/schema-builder/table/TableColumn"
import { Table } from "../../src/schema-builder/table/Table"
import { SqlServerQueryRunner } from "../../src/driver/sqlserver/SqlServerQueryRunner"
import { OracleQueryRunner } from "../../src/driver/oracle/OracleQueryRunner"
import { CockroachQueryRunner } from "../../src/driver/cockroachdb/CockroachQueryRunner"
import type { SqlServerDriver } from "../../src/driver/sqlserver/SqlServerDriver"
import type { OracleDriver } from "../../src/driver/oracle/OracleDriver"
import type { CockroachDriver } from "../../src/driver/cockroachdb/CockroachDriver"

class MetadataOnlyDataSource extends DataSource {
    prepareMetadata() {
        return this.buildMetadatas()
    }
}

class InspectSqlServerQueryRunner extends SqlServerQueryRunner {
    declaration(table: Table, column: TableColumn) {
        return this.buildCreateColumnSql(table, column, false, true)
    }
}

class InspectOracleQueryRunner extends OracleQueryRunner {
    declaration(table: Table, column: TableColumn) {
        return this.buildCreateColumnSql(column)
    }
}

class InspectCockroachQueryRunner extends CockroachQueryRunner {
    declaration(table: Table, column: TableColumn) {
        return this.buildCreateColumnSql(table, column)
    }
}

type Engine = "mssql" | "oracle" | "cockroachdb"

async function fixture(engine: Engine, options: EntitySchemaColumnOptions) {
    const entity = new EntitySchema({
        name: "CollatedOverride",
        columns: { id: { type: Number, primary: true }, value: options },
    })
    // A client stub and metadata-only setup prevent any network connection.
    const dataSource = new MetadataOnlyDataSource({
        type: engine,
        driver: {},
        entities: [entity],
    } as never)
    await dataSource.prepareMetadata()
    const metadata = dataSource.getMetadata(entity)
    const column = metadata.findColumnWithPropertyName("value")!
    const physical = column.resolveDriverColumn(dataSource.driver)
    const tableColumn = new TableColumn(
        TableUtils.createTableColumnOptions(column, dataSource.driver),
    )
    const table = new Table({
        name: metadata.tableName,
        columns: [tableColumn],
    })
    const runner =
        engine === "mssql"
            ? new InspectSqlServerQueryRunner(
                  dataSource.driver as SqlServerDriver,
                  "master",
              )
            : engine === "oracle"
              ? new InspectOracleQueryRunner(
                    dataSource.driver as OracleDriver,
                    "master",
                )
              : new InspectCockroachQueryRunner(
                    dataSource.driver as CockroachDriver,
                    "master",
                )
    expect(dataSource.isInitialized).to.equal(false)
    return {
        column,
        physical,
        declaration: runner.declaration(table, tableColumn),
    }
}

const cases: Record<
    Engine,
    { type: string; collation: string; removed: string[]; retained: string[] }
> = {
    mssql: {
        type: "nvarchar",
        collation: "Latin1_General_CI_AS",
        removed: ["int", "decimal(10,2)", "datetime2", "varbinary(max)"],
        retained: [
            "char(4)",
            "varchar(40)",
            "text",
            "nchar(4)",
            "nvarchar(max)",
            "ntext",
        ],
    },
    oracle: {
        type: "varchar2",
        collation: "BINARY_CI",
        removed: ["number", "blob", "timestamp"],
        retained: ["char(4)", "nchar(4)", "varchar2(40)", "nvarchar2(40)"],
    },
    cockroachdb: {
        type: "varchar",
        collation: "en_US",
        removed: ["int8", "bytes", "uuid"],
        retained: ["string", "text", "varchar(40)", "char(4)"],
    },
}

// Regression coverage for the cross-driver collation review on PR #12884 (issue #12874).
describe("ColumnMetadata > dialect type collation compatibility", () => {
    for (const engine of Object.keys(cases) as Engine[]) {
        const { type, collation, removed, retained } = cases[engine]
        for (const override of removed) {
            it(`${engine} removes collation from ${override}`, async () => {
                const f = await fixture(engine, {
                    type: type as EntitySchemaColumnOptions["type"],
                    length: 40,
                    collation,
                    dialectTypes: { [engine]: override },
                })
                expect(f.physical.collation).to.equal(undefined)
                expect(f.declaration).not.to.contain("COLLATE")
                expect(f.column.collation).to.equal(collation)
            })
        }
        for (const override of retained) {
            it(`${engine} retains collation for ${override}`, async () => {
                const f = await fixture(engine, {
                    type: type as EntitySchemaColumnOptions["type"],
                    length: 40,
                    collation,
                    dialectTypes: { [engine]: override },
                })
                expect(f.physical.collation).to.equal(collation)
                expect(f.declaration).to.contain("COLLATE")
            })
        }
        it(`${engine} keeps collation without an override`, async () => {
            const f = await fixture(engine, {
                type: type as EntitySchemaColumnOptions["type"],
                length: 40,
                collation,
            })
            expect(f.physical).to.equal(f.column)
            expect(f.declaration).to.contain("COLLATE")
        })
    }
})
