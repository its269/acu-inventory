import mysql from "mysql2/promise";

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || "3306", 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_INVENTORY_DATABASE || process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

export const MySqlService = {
    /**
     * Fetch inventory with pagination, search, and branch filtering (for Dashboard)
     */
    async getInventory({ page = 1, pageSize = 50, search = "", branch = "" }) {
        const offset = (page - 1) * pageSize;

        try {
            let whereClauses = [];
            let params = [];

            if (branch) {
                whereClauses.push("default_warehouse = ?");
                params.push(branch);
            }

            if (search) {
                whereClauses.push("(inventory_id LIKE ? OR inventory_name LIKE ?)");
                params.push(`%${search}%`, `%${search}%`);
            }

            const wherePart = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

            const limitInt = parseInt(pageSize, 10);
            const offsetInt = parseInt(offset, 10);

            const [rows] = await pool.query(
                `SELECT 
                    inventory_id as InventoryID, 
                    inventory_name as Description, 
                    item_class as ItemClass, 
                    default_warehouse as Branch, 
                    default_warehouse as SiteID, 
                    0 as OnHand, 
                    0 as Available, 
                    default_price as DefaultPrice 
                 FROM inventory_items 
                 ${wherePart} 
                 ORDER BY inventory_id ASC 
                 LIMIT ${limitInt} OFFSET ${offsetInt}`,
                params
            );

            const [[{ total }]] = await pool.query(
                `SELECT COUNT(*) as total FROM inventory_items ${wherePart}`,
                params
            );

            // Transform rows to match the BFF structure (objects with .value)
            const transformed = rows.map(item => ({
                InventoryID: { value: item.InventoryID },
                Description: { value: item.Description || "—" },
                SiteID: { value: item.SiteID },
                Branch: { value: item.Branch },
                OnHand: { value: item.OnHand },
                Available: { value: item.Available },
                DefaultPrice: { value: item.DefaultPrice || 0 },
                ItemClass: { value: item.ItemClass || "" },
            }));

            return {
                data: transformed,
                totalCount: total,
                hasMore: total > offset + pageSize
            };
        } catch (err) {
            console.error("[MySQL getInventory Error]", err);
            throw err;
        }
    },

    /**
     * Calculate global stats (Total Value, Low Stock, etc.)
     */
    async getGlobalStats(branch = "", search = "") {
        try {
            let whereClauses = [];
            let params = [];

            if (branch) {
                whereClauses.push("default_warehouse = ?");
                params.push(branch);
            }

            if (search) {
                whereClauses.push("(inventory_id LIKE ? OR inventory_name LIKE ?)");
                params.push(`%${search}%`, `%${search}%`);
            }

            const wherePart = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

            const [[{ count }]] = await pool.execute(
                `SELECT COUNT(*) as count FROM inventory_items ${wherePart}`,
                params
            );

            return {
                totalValue: 0,
                lowStock: 0,
                outOfStock: 0,
                count
            };
        } catch (err) {
            console.error("[MySQL getGlobalStats Error]", err);
            throw err;
        }
    },

    /**
     * Fetch stock items from MySQL database (for Stock Items module)
     */
    async getStockItems({ page = 1, pageSize = 50, search = "" } = {}) {
        const offset = (page - 1) * pageSize;
        // Use integers directly — pool.execute() prepared statements
        // have issues with LIMIT/OFFSET binding in some MySQL versions
        const limitInt = parseInt(pageSize, 10);
        const offsetInt = parseInt(offset, 10);

        try {
            let whereClause = "";
            let params = [];

            if (search) {
                whereClause = "WHERE (TRIM(UPPER(inventory_id)) LIKE TRIM(UPPER(?)) OR TRIM(UPPER(inventory_name)) LIKE TRIM(UPPER(?)))";
                params = [`%${search}%`, `%${search}%`];
            }

            // pool.query() avoids prepared-statement LIMIT/OFFSET binding issues
            const [rows] = await pool.query(
                `SELECT 
                    TRIM(inventory_id) as inventoryId, 
                    inventory_name as description, 
                    item_class as itemClass, 
                    default_warehouse as branch, 
                    item_status as itemStatus,
                    base_unit as baseUnit,
                    default_price as price 
                 FROM inventory_items 
                 ${whereClause} 
                 ORDER BY inventory_id ASC 
                 LIMIT ${limitInt} OFFSET ${offsetInt}`,
                params
            );

            const [[{ total }]] = await pool.query(
                `SELECT COUNT(*) as total FROM inventory_items ${whereClause}`,
                params
            );

            return {
                items: rows,
                totalCount: total
            };
        } catch (err) {
            console.error("[MySQL getStockItems Error]", err);
            throw err;
        }
    },

    /**
     * Fetch stock item detail from MySQL
     */
    async getStockItemDetail(inventoryId) {
        try {
            const [rows] = await pool.execute(
                `SELECT 
                    TRIM(inventory_id) as inventoryId, 
                    inventory_name as description, 
                    item_class as itemClass, 
                    default_warehouse as branch, 
                    default_price as price,
                    item_status as itemStatus,
                    base_unit as baseUnit,
                    type,
                    posting_class as postingClass
                 FROM inventory_items 
                 WHERE TRIM(UPPER(inventory_id)) = TRIM(UPPER(?))`,
                [inventoryId]
            );

            if (rows.length === 0) return null;

            const item = rows[0];

            return {
                inventoryId: item.inventoryId,
                description: item.description || "—",
                itemClass: item.itemClass || "—",
                unitPrice: item.price || 0,
                itemStatus: item.itemStatus || "—",
                baseUnit: item.baseUnit || "—",
                type: item.type || "—",
                postingClass: item.postingClass || "—",
                defaultWarehouse: item.branch || "—",
                totalOnHand: 0,
                totalAvailable: 0,
                branches: []
            };
        } catch (err) {
            console.error("[MySQL getStockItemDetail Error]", err);
            return null;
        }
    },

    /**
     * Fetch unique branches from MySQL
     */
    async getBranches() {
        try {
            const [rows] = await pool.execute(
                `SELECT DISTINCT default_warehouse FROM inventory_items WHERE default_warehouse IS NOT NULL AND default_warehouse != '' ORDER BY default_warehouse ASC`
            );

            return rows.map(r => ({
                SiteID: r.default_warehouse,
                Description: { value: r.default_warehouse }
            }));
        } catch (err) {
            console.error("[MySQL getBranches Error]", err);
            return [];
        }
    },

    /**
     * Fetch product catalog (id, class, description) for mapping
     */
    async getProductCatalog() {
        try {
            const [rows] = await pool.execute(
                `SELECT DISTINCT inventory_id, item_class, inventory_name as description FROM inventory_items`
            );
            return rows;
        } catch (err) {
            console.error("[MySQL getProductCatalog Error]", err);
            return [];
        }
    },

    /**
     * Get overall stock sum, optionally filtered by branch
     */
    async getOverallStocks(branch = "") {
        // on_hand data not available in catalog table — return 0
        return 0;
    },

    /**
     * Bulk upsert branches
     */
    async upsertBranches(branches) {
        if (!branches.length) return;
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const b of branches) {
                await connection.execute(
                    `INSERT INTO branches (branch_id, branch_name, active) 
                     VALUES (?, ?, ?) 
                     ON DUPLICATE KEY UPDATE branch_name = VALUES(branch_name), active = VALUES(active)`,
                    [b.branch_id, b.branch_name, b.active ? 1 : 0]
                );
            }
            await connection.commit();
        } catch (err) {
            await connection.rollback();
            console.error("[MySQL upsertBranches Error]", err);
            throw err;
        } finally {
            connection.release();
        }
    },

    /**
     * Bulk upsert products into inventory_items
     * Note: In this schema, inventory_items seems to hold everything.
     */
    async upsertInventoryItems(items) {
        if (!items.length) return;
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const item of items) {
                // Since inventory_items might be per branch, we need to be careful with primary keys.
                // If it's a flat catalog, we use inventory_id. 
                // If it's levels, we use inventory_id + branch_id + site_id.
                // I'll assume inventory_id is the key for now, or just do a general update.

                await connection.execute(
                    `INSERT INTO inventory_items 
                        (inventory_id, description, item_class, default_price, item_status, base_unit, last_sync) 
                     VALUES (?, ?, ?, ?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE 
                        description = VALUES(description), 
                        item_class = VALUES(item_class), 
                        default_price = VALUES(default_price),
                        item_status = VALUES(item_status),
                        base_unit = VALUES(base_unit),
                        last_sync = VALUES(last_sync)`,
                    [
                        item.inventory_id,
                        item.description,
                        item.item_class,
                        item.default_price,
                        item.item_status,
                        item.base_unit,
                        new Date()
                    ]
                );
            }
            await connection.commit();
        } catch (err) {
            await connection.rollback();
            console.error("[MySQL upsertInventoryItems Error]", err);
            throw err;
        } finally {
            connection.release();
        }
    },

    /**
     * Upsert inventory levels
     */
    async upsertInventoryLevels(levels) {
        if (!levels.length) return;
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const l of levels) {
                await connection.execute(
                    `INSERT INTO inventory_items 
                        (inventory_id, branch_id, site_id, on_hand, available, last_sync) 
                     VALUES (?, ?, ?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE 
                        on_hand = VALUES(on_hand), 
                        available = VALUES(available),
                        last_sync = VALUES(last_sync)`,
                    [l.inventory_id, l.branch_id, l.site_id, l.on_hand, l.available, new Date()]
                );
            }
            await connection.commit();
        } catch (err) {
            await connection.rollback();
            console.error("[MySQL upsertInventoryLevels Error]", err);
            throw err;
        } finally {
            connection.release();
        }
    }
};
