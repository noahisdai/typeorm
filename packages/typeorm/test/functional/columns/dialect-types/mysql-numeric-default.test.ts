import { expect } from "chai"
import "reflect-metadata"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import type { DataSource } from "../../../../src/data-source/DataSource"
import { MysqlNumericDefault } from "./entity-mysql-numeric-default/MysqlNumericDefault"

// Regression coverage for the MySQL numeric default review on PR #12884 (issue #12874).
describe("columns > dialect types > MySQL numeric defaults", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            entities: [__dirname + "/entity-mysql-numeric-default/*{.js,.ts}"],
            enabledDrivers: ["mysql", "mariadb"],
            schemaCreate: true,
            dropSchema: true,
        })
    })
    beforeEach(() => reloadTestingDatabases(dataSources))
    after(() => closeTestingConnections(dataSources))

    it("should keep decimal digits of a default overridden to varchar", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(MysqlNumericDefault)
                await repository.insert({ id: 1 })
                const row = await repository.findOneByOrFail({ id: 1 })
                expect(row.amount).to.equal("1.23")
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
})
