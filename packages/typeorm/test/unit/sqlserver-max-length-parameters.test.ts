import { expect } from "chai"
import { DataSource } from "../../src/data-source/DataSource"
import type { ColumnOptions } from "../../src/decorator/options/ColumnOptions"
import type { MssqlParameter } from "../../src/driver/sqlserver/MssqlParameter"
import type { SqlServerDriver } from "../../src/driver/sqlserver/SqlServerDriver"
import { ColumnMetadata } from "../../src/metadata/ColumnMetadata"
import { EntityMetadata } from "../../src/metadata/EntityMetadata"

// Regression coverage for the SQL Server MAX bind review on PR #12884 (issue #12874).
describe("SqlServerDriver > MAX length parameters", () => {
    // The client stub provides only the MAX constant; the data source is not
    // initialized, so these tests never connect.
    const MAX = 65535
    const dataSource = new DataSource({ type: "mssql", driver: { MAX } })
    const driver = dataSource.driver as SqlServerDriver
    const entityMetadata = new EntityMetadata({
        dataSource,
        args: { target: "MaxValue", type: "regular" },
    })

    function parameter(options: ColumnOptions): MssqlParameter {
        const column = new ColumnMetadata({
            entityMetadata,
            args: {
                target: "MaxValue",
                propertyName: "value",
                mode: "regular",
                options,
            },
        })
        column.databaseName = "value"
        return driver.parametrizeValue(column, "value")
    }

    for (const override of [
        "nvarchar(max)",
        "varchar(MAX)",
        "varbinary(max)",
    ]) {
        it(`binds a ${override} override with the numeric MAX length`, () => {
            const bound = parameter({
                type: "varchar",
                length: 10,
                dialectTypes: { mssql: override },
            })
            expect(bound.params).to.deep.equal([MAX])
        })
    }

    it("binds a logical MAX length with the numeric MAX length", () => {
        const bound = parameter({ type: "nvarchar", length: "MAX" })
        expect(bound.type).to.equal("nvarchar")
        expect(bound.params).to.deep.equal([MAX])
    })

    it("binds a bounded length as a number", () => {
        const bound = parameter({
            type: "varchar",
            length: 10,
            dialectTypes: { mssql: "nvarchar(100)" },
        })
        expect(bound.params).to.deep.equal([100])
    })
})
