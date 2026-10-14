import "reflect-metadata"

import { expect } from "chai"

import { DataSource } from "../../../../src"
import { EntitySchema } from "../../../../src/entity-schema/EntitySchema"
import type { DataSourceOptions } from "../../../../src/data-source/DataSourceOptions"
import {
    closeTestingConnections,
    createTestingConnections,
} from "../../../utils/test-utils"

// Regression coverage for the MySQL numeric default review on PR #12884 (issue #12874).
describe("columns > dialect types > MySQL numeric defaults", () => {
    let dataSources: DataSource[]

    before(async () => {
        dataSources = await createTestingConnections({
            entities: [],
            enabledDrivers: ["mysql", "mariadb"],
            schemaCreate: false,
            dropSchema: true,
        })
    })

    after(() => closeTestingConnections(dataSources))

    it("should keep decimal digits of a default overridden to varchar", () =>
        Promise.all(
            dataSources.map(async (source) => {
                const driverType = source.driver.options.type
                const entity = new EntitySchema<{ id: number; amount: string }>(
                    {
                        name: "DialectMysqlNumericDefault",
                        columns: {
                            id: { type: Number, primary: true },
                            amount: {
                                type: "decimal",
                                precision: 4,
                                scale: 2,
                                default: 1.23,
                                dialectTypes: { [driverType]: "varchar(10)" },
                            },
                        },
                    },
                )
                const dataSource = new DataSource({
                    ...source.options,
                    entities: [entity],
                    synchronize: true,
                    dropSchema: false,
                } as DataSourceOptions)
                await dataSource.initialize()
                const runner = dataSource.createQueryRunner()
                try {
                    const repository = dataSource.getRepository(entity)
                    await repository.insert({ id: 1 })
                    const row = await repository.findOneByOrFail({ id: 1 })
                    expect(row.amount).to.equal("1.23")
                    const metadata = dataSource.getMetadata(entity)
                    const table = await runner.getTable(metadata.tableName)
                    expect(table!.findColumnByName("amount")!.type).to.equal(
                        "varchar",
                    )
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
