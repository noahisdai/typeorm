import { expect } from "chai"
import "reflect-metadata"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import type { DataSource } from "../../../../src/data-source/DataSource"

// Regression coverage for the cross-driver collation review on PR #12884 (issue #12874).
const cases = [
    {
        driver: "mssql" as const,
        entityDir: "entity-collation-mssql",
        table: "mssql_collation_override",
        collation: "Latin1_General_CI_AS",
    },
    {
        driver: "cockroachdb" as const,
        entityDir: "entity-collation-cockroachdb",
        table: "cockroach_collation_override",
        collation: "en_US",
    },
]

for (const { driver, entityDir, table, collation } of cases) {
    describe(`columns > dialect types > ${driver} collation overrides`, () => {
        let dataSources: DataSource[]
        before(async () => {
            dataSources = await createTestingConnections({
                entities: [__dirname + `/${entityDir}/*{.js,.ts}`],
                enabledDrivers: [driver],
                schemaCreate: true,
                dropSchema: true,
            })
        })
        beforeEach(() => reloadTestingDatabases(dataSources))
        after(() => closeTestingConnections(dataSources))

        it("should drop inherited collation only for non-collatable overrides", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    const queryRunner = dataSource.createQueryRunner()
                    try {
                        const loaded = await queryRunner.getTable(table)
                        expect(
                            loaded!.findColumnByName("numericValue")!.collation,
                        ).to.be.undefined
                        expect(
                            loaded!.findColumnByName("textValue")!.collation,
                        ).to.equal(collation)
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
    })
}
