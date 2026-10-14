import { expect } from "chai"
import "reflect-metadata"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { DataSource } from "../../../../src/data-source/DataSource"
import type { DataSourceOptions } from "../../../../src/data-source/DataSourceOptions"
import { EntitySchema } from "../../../../src/entity-schema/EntitySchema"

// Regression coverage for the MariaDB timestamp precision review on PR #12884 (issue #12874).
describe("columns > dialect types > MariaDB timestamp precision", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            entities: [
                __dirname + "/entity-mariadb-timestamp-precision/*{.js,.ts}",
            ],
            enabledDrivers: ["mariadb"],
            schemaCreate: true,
            dropSchema: true,
        })
    })
    beforeEach(() => reloadTestingDatabases(dataSources))
    after(() => closeTestingConnections(dataSources))

    it("should create a less precise DEFAULT and a matching ON UPDATE", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const queryRunner = dataSource.createQueryRunner()
                try {
                    const table = await queryRunner.getTable(
                        "mariadb_timestamp_precision",
                    )
                    const column = table!.findColumnByName("changedAt")!
                    expect(column.precision).to.equal(6)
                    expect(column.default).to.equal("CURRENT_TIMESTAMP(3)")
                    expect(column.onUpdate).to.equal("CURRENT_TIMESTAMP(6)")
                } finally {
                    await queryRunner.release()
                }
            }),
        ))

    it("should not plan schema changes on the next synchronization", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const queries = await dataSource.driver
                    .createSchemaBuilder()
                    .log()
                expect(queries.upQueries).to.be.empty
                expect(queries.downQueries).to.be.empty
            }),
        ))

    it("should reject a less precise ON UPDATE during initialization", () =>
        Promise.all(
            dataSources.map(async (source) => {
                const entity = new EntitySchema({
                    name: "MariadbOnUpdateConflict",
                    columns: {
                        id: { type: Number, primary: true },
                        changedAt: {
                            type: "datetime",
                            precision: 3,
                            onUpdate: "CURRENT_TIMESTAMP(3)",
                            dialectTypes: { mariadb: "datetime(6)" },
                        },
                    },
                })
                const dataSource = new DataSource({
                    ...source.options,
                    entities: [entity],
                    synchronize: true,
                    dropSchema: false,
                } as DataSourceOptions)
                let failure: unknown
                try {
                    await dataSource.initialize()
                } catch (error) {
                    failure = error
                } finally {
                    if (dataSource.isInitialized) await dataSource.destroy()
                }
                expect(failure).to.be.instanceOf(Error)
                expect((failure as Error).message).to.contain(
                    "ON UPDATE CURRENT_TIMESTAMP precision must match",
                )
            }),
        ))
})
