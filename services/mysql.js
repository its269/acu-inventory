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

const purchasePool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || "3306", 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_PURCHASE_DATABASE || "db_purchase",
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
            let whereClauses = ["default_warehouse IS NOT NULL", "default_warehouse != '__catalog__'"];
            let params = [];

            if (search) {
                whereClauses.push("(inventory_id LIKE ? OR inventory_name LIKE ?)");
                params.push(`%${search}%`, `%${search}%`);
            }

            const wherePart = `WHERE ${whereClauses.join(" AND ")}`;

            const limitInt = parseInt(pageSize, 10);
            const offsetInt = parseInt(offset, 10);

            const [rows] = await pool.query(
                `SELECT 
                    inventory_id as InventoryID, 
                    inventory_name as Description, 
                    item_class as ItemClass, 
                    default_warehouse as Branch, 
                    default_warehouse as SiteID, 
                    COALESCE(on_hand, 0) as OnHand, 
                    COALESCE(available, 0) as Available, 
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
            let whereClauses = ["default_warehouse IS NOT NULL", "default_warehouse != '__catalog__'"];
            let params = [];

            if (branch) {
                whereClauses.push("default_warehouse = ?");
                params.push(branch);
            }

            if (search) {
                whereClauses.push("(inventory_id LIKE ? OR inventory_name LIKE ?)");
                params.push(`%${search}%`, `%${search}%`);
            }

            const wherePart = `WHERE ${whereClauses.join(" AND ")}`;

            const [[stats]] = await pool.query(
                `SELECT
                    COUNT(*) as total,
                    SUM(COALESCE(on_hand, 0) * COALESCE(default_price, 0)) as totalValue,
                    SUM(CASE WHEN on_hand > 0 AND on_hand < 10 THEN 1 ELSE 0 END) as lowStock,
                    SUM(CASE WHEN on_hand <= 0 THEN 1 ELSE 0 END) as outOfStock
                 FROM inventory_items ${wherePart}`,
                params
            );

            return {
                totalValue: Number(stats.totalValue) || 0,
                lowStock: Number(stats.lowStock) || 0,
                outOfStock: Number(stats.outOfStock) || 0,
                count: Number(stats.total) || 0
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
                `SELECT DISTINCT default_warehouse FROM inventory_items WHERE default_warehouse IS NOT NULL AND default_warehouse != '' AND default_warehouse != '__catalog__' ORDER BY default_warehouse ASC`
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
     * Bulk-update catalog fields on existing inventory_items rows.
     * Uses INSERT ... ON DUPLICATE KEY UPDATE so a single SQL statement handles
     * the whole batch — avoids row-by-row UPDATE timeouts on large catalogs.
     * default_warehouse is set to '' as a placeholder; the UNIQUE KEY
     * (inventory_id, default_warehouse) means this won't conflict with real
     * warehouse rows, and existing rows keep their real default_warehouse.
     */
    async upsertInventoryItems(items) {
        if (!items.length) return;
        const CHUNK = 200;
        const now = new Date();
        const safeNum = (v) => { const n = Number(v); return (isNaN(n) ? null : n); };
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (let i = 0; i < items.length; i += CHUNK) {
                const chunk = items.slice(i, i + CHUNK);
                const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',');
                const values = chunk.flatMap(item => [
                    item.inventory_id,
                    '__catalog__',          // sentinel warehouse — never shown
                    item.description,
                    item.item_class,
                    safeNum(item.default_price),
                    item.item_status || 'active',
                    item.base_unit || '',
                    item.item_type || '',
                    item.posting_class || '',
                    now,
                ]);
                await connection.query(
                    `INSERT INTO inventory_items
                        (inventory_id, default_warehouse, inventory_name, item_class,
                         default_price, item_status, base_unit, type, posting_class, last_sync)
                     VALUES ${placeholders}
                     ON DUPLICATE KEY UPDATE
                        inventory_name = VALUES(inventory_name),
                        item_class     = VALUES(item_class),
                        default_price  = VALUES(default_price),
                        item_status    = VALUES(item_status),
                        base_unit      = VALUES(base_unit),
                        type           = COALESCE(NULLIF(VALUES(type),''), type),
                        posting_class  = COALESCE(NULLIF(VALUES(posting_class),''), posting_class),
                        last_sync      = VALUES(last_sync)`,
                    values
                );
            }
            await connection.commit();
        } catch (err) {
            await connection.rollback();
            console.error('[MySQL upsertInventoryItems Error]', err);
            throw err;
        } finally {
            connection.release();
        }
    },

    /**
     * Bulk upsert inventory levels — INSERT new rows or UPDATE on_hand/available
     * on existing rows via uq_inv_warehouse (inventory_id, default_warehouse).
     * Uses chunked multi-row INSERT for performance.
     */
    async upsertInventoryLevels(levels) {
        if (!levels.length) return;
        const CHUNK = 200;
        const now = new Date();
        const safeNum = (v) => { const n = Number(v); return (isNaN(n) ? null : n); };
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (let i = 0; i < levels.length; i += CHUNK) {
                const chunk = levels.slice(i, i + CHUNK);
                const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
                const values = chunk.flatMap(l => [
                    l.inventory_id,
                    l.branch_id,
                    l.description || null,
                    l.item_class || null,
                    safeNum(l.default_price),
                    l.item_status || 'active',
                    l.base_unit || '',
                    l.item_type || '',
                    l.posting_class || '',
                    l.branch_id,
                    l.site_id,
                    safeNum(l.on_hand) ?? 0,
                    safeNum(l.available) ?? 0,
                    now,
                ]);
                await connection.query(
                    `INSERT INTO inventory_items
                        (inventory_id, default_warehouse, inventory_name, item_class,
                         default_price, item_status, base_unit, type, posting_class,
                         branch_id, site_id, on_hand, available, last_sync)
                     VALUES ${placeholders}
                     ON DUPLICATE KEY UPDATE
                        on_hand        = VALUES(on_hand),
                        available      = VALUES(available),
                        branch_id      = VALUES(branch_id),
                        site_id        = VALUES(site_id),
                        inventory_name = COALESCE(VALUES(inventory_name), inventory_name),
                        item_class     = COALESCE(VALUES(item_class),     item_class),
                        default_price  = COALESCE(VALUES(default_price),  default_price),
                        item_status    = COALESCE(VALUES(item_status),    item_status),
                        base_unit      = COALESCE(VALUES(base_unit),      base_unit),
                        type           = COALESCE(NULLIF(VALUES(type),''), type),
                        posting_class  = COALESCE(NULLIF(VALUES(posting_class),''), posting_class),
                        last_sync      = VALUES(last_sync)`,
                    values
                );
            }
            await connection.commit();
        } catch (err) {
            await connection.rollback();
            console.error('[MySQL upsertInventoryLevels Error]', err);
            throw err;
        } finally {
            connection.release();
        }
    },

    /**
     * Bulk upsert rows from Supabase product_periodic_sales into db_purchase
     */
    async upsertPeriodicSales(rows) {
        if (!rows.length) return;
        const connection = await purchasePool.getConnection();
        try {
            await connection.beginTransaction();
            for (const r of rows) {
                await connection.execute(
                    `INSERT INTO product_periodic_sales
                        (id, branch_name, order_type, financial_period, document_date,
                         description, qty, total_amount, item_class, inventory_id,
                         posting_class, last_sync)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        branch_name      = VALUES(branch_name),
                        order_type       = VALUES(order_type),
                        financial_period = VALUES(financial_period),
                        document_date    = VALUES(document_date),
                        description      = VALUES(description),
                        qty              = VALUES(qty),
                        total_amount     = VALUES(total_amount),
                        item_class       = VALUES(item_class),
                        inventory_id     = VALUES(inventory_id),
                        posting_class    = VALUES(posting_class),
                        last_sync        = VALUES(last_sync)`,
                    [
                        r.id,
                        r.branch_name ?? null,
                        r.order_type ?? null,
                        r.financial_period ?? null,
                        r.document_date ?? null,
                        r.description ?? null,
                        r.qty ?? null,
                        r.total_amount ?? null,
                        r.item_class ?? null,
                        r.inventory_id ?? null,
                        r.posting_class ?? null,
                        r.last_sync ? new Date(r.last_sync) : new Date(),
                    ]
                );
            }
            await connection.commit();
        } catch (err) {
            await connection.rollback();
            console.error("[MySQL upsertPeriodicSales Error]", err);
            throw err;
        } finally {
            connection.release();
        }
    },

    /**
     * Aggregate periodic sales by inventory_id for a given branch/search filter.
     * Returns Map<inventory_id_upper, { qty_sold, total_sales }>
     */
    async getPeriodicSalesSummary({ branch = "", search = "" } = {}) {
        try {
            const whereClauses = [];
            const params = [];

            if (branch) {
                whereClauses.push("UPPER(branch_name) = UPPER(?)");
                params.push(branch);
            }
            if (search) {
                whereClauses.push("(inventory_id LIKE ? OR description LIKE ?)");
                params.push(`%${search}%`, `%${search}%`);
            }

            const wherePart = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

            const [rows] = await purchasePool.query(
                `SELECT
                    UPPER(TRIM(inventory_id)) AS inventory_id,
                    SUM(qty)          AS qty_sold,
                    SUM(total_amount) AS total_sales
                 FROM product_periodic_sales
                 ${wherePart}
                 GROUP BY UPPER(TRIM(inventory_id))`,
                params
            );

            const map = new Map();
            for (const r of rows) {
                if (r.inventory_id) {
                    map.set(r.inventory_id, {
                        qty_sold: Number(r.qty_sold) || 0,
                        total_sales: Number(r.total_sales) || 0,
                    });
                }
            }
            return map;
        } catch (err) {
            console.error("[MySQL getPeriodicSalesSummary Error]", err);
            return new Map();
        }
    },
};
