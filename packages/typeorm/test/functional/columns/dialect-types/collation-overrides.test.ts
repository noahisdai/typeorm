import "reflect-metadata"

import { expect } from "chai"

import { DataSource } from "../../../../src"
import { EntitySchema } from "../../../../src/entity-schema/EntitySchema"
import type { DataSourceOptions } from "../../../../src/data-source/DataSourceOptions"
import {
    closeTestingConnections,
    createTestingConnections,
} from "../../../utils/test-utils"

const physicalTypes: Record<string, { numeric: string; text: string }> = {
    mssql: { numeric: "int", text: "nvarchar(40)" },
    cockroachdb: { numeric: "int8", text: "string" },
}

const collations: Record<string, string> = {
    mssql: "Latin1_General_CI_AS",
    cockroachdb: "en_US",
}

// Regression coverage for the cross-driver collation review on PR #12884 (issue #12874).
describe("columns > dialect types > collation overrides", () => {
    let dataSources: DataSource[]

    before(async () => {
        dataSources = await createTestingConnections({
            entities: [],
            enabledDrivers: ["mssql", "cockroachdb"],
            schemaCreate: false,
            dropSchema: true,
        })
    })

    after(() => closeTestingConnections(dataSources))

    it("should drop inherited collation only for non-collatable overrides", () =>
        Promise.all(
            dataSources.map(async (source) => {
                const driverType = source.driver.options.type
                const collation = collations[driverType]
                const { numeric, text } = physicalTypes[driverType]
                const entity = new EntitySchema({
                    name: "DialectCollationOverride",
                    columns: {
                        id: { type: Number, primary: true },
                        numericValue: {
                            type: "varchar",
                            length: 40,
                            collation,
                            nullable: true,
                            dialectTypes: { [driverType]: numeric },
                        },
                        textValue: {
                            type: "varchar",
                            length: 40,
                            collation,
                            nullable: true,
                            dialectTypes: { [driverType]: text },
                        },
                    },
                })
                const dataSource = new DataSource({
                    ...source.options,
                    entities: [entity],
                    synchronize: true,
                    dropSchema: false,
                } as DataSourceOptions)
                await dataSource.initialize()
                const runner = dataSource.createQueryRunner()
                try {
                    const metadata = dataSource.getMetadata(entity)
                    const table = await runner.getTable(metadata.tableName)
                    expect(table!.findColumnByName("numericValue")!.collation)
                        .to.be.undefined
                    expect(
                        table!.findColumnByName("textValue")!.collation,
                    ).to.equal(collation)
                    expect(
                        metadata.findColumnWithPropertyName("numericValue")!
                            .collation,
                    ).to.equal(collation)
                    const queries = await dataSource.driver
                        .createSchemaBuilder()
                        .log()
                    expect(queries.upQueries).to.be.empty
                    expect(queries.downQueries).to.be.empty
                } finally {
                    await runner.dropTable(
                        dataSource.getMetadata(entity).tableName,
                    )
                    await runner.release()
                    await dataSource.destroy()
                }
            }),
        ))
})
