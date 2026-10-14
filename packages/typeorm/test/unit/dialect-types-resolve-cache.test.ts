import "reflect-metadata"
import { expect } from "chai"
import { DataSource } from "../../src/data-source/DataSource"
import { EntitySchema } from "../../src/entity-schema/EntitySchema"

class MetadataOnlyDataSource extends DataSource {
    prepareMetadata() {
        return this.buildMetadatas()
    }
}

const entity = new EntitySchema<{ id: number; payload: string }>({
    name: "CachedOverride",
    columns: {
        id: { type: Number, primary: true },
        payload: {
            type: "varchar",
            length: 40,
            dialectTypes: { postgres: "text" },
        },
    },
})

async function fixture() {
    // A client stub and metadata-only setup prevent any network connection.
    const dataSource = new MetadataOnlyDataSource({
        type: "postgres",
        driver: {},
        entities: [entity],
    })
    await dataSource.prepareMetadata()
    const column = dataSource
        .getMetadata(entity)
        .findColumnWithPropertyName("payload")!
    expect(dataSource.isInitialized).to.equal(false)
    return { dataSource, column }
}

// Regression coverage for the resolveDriverColumn performance review on PR #12884 (issue #12874).
describe("ColumnMetadata > dialect type projection cache", () => {
    it("returns the same projection for repeated calls with one driver", async () => {
        const { dataSource, column } = await fixture()
        const first = column.resolveDriverColumn(dataSource.driver)
        expect(first).not.to.equal(column)
        expect(column.resolveDriverColumn(dataSource.driver)).to.equal(first)
        expect(first.type).to.equal("text")
        expect(column.type).to.equal("varchar")
        expect(column.length).to.equal("40")
    })

    it("keeps separate projections per driver", async () => {
        const a = await fixture()
        const b = await fixture()
        const fromA = a.column.resolveDriverColumn(a.dataSource.driver)
        const fromB = a.column.resolveDriverColumn(b.dataSource.driver)
        expect(fromB).not.to.equal(fromA)
        expect(fromB.type).to.equal("text")
    })

    it("recomputes when the override changes", async () => {
        const { dataSource, column } = await fixture()
        const first = column.resolveDriverColumn(dataSource.driver)
        column.dialectTypes = { postgres: "varchar(80)" }
        const second = column.resolveDriverColumn(dataSource.driver)
        expect(second).not.to.equal(first)
        expect(second.length).to.equal("80")
    })

    it("clears the cache when the column is rebuilt", async () => {
        const { dataSource, column } = await fixture()
        const first = column.resolveDriverColumn(dataSource.driver)
        column.build(dataSource)
        expect(column.resolveDriverColumn(dataSource.driver)).not.to.equal(
            first,
        )
    })

    it("returns the logical column without an override", async () => {
        const { dataSource } = await fixture()
        const id = dataSource
            .getMetadata(entity)
            .findColumnWithPropertyName("id")!
        expect(id.resolveDriverColumn(dataSource.driver)).to.equal(id)
    })

    it("builds the same bulk insert SQL with the cache", async () => {
        const { dataSource } = await fixture()
        const values = Array.from({ length: 3 }, (_, i) => ({
            id: i,
            payload: `row ${i}`,
        }))
        const [sql, parameters] = dataSource
            .createQueryBuilder()
            .insert()
            .into(entity)
            .values(values)
            .getQueryAndParameters()
        expect(sql).to.equal(
            `INSERT INTO "cached_override"("id", "payload") VALUES ($1, $2), ($3, $4), ($5, $6)`,
        )
        expect(parameters).to.deep.equal([0, "row 0", 1, "row 1", 2, "row 2"])
    })
})
