import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "inventory.sqlite");

function valueOf(field, fallback = "") {
    if (field == null) return fallback;
    if (typeof field === "object") {
        if (field.value != null) return field.value;
        if (field.Value != null) return field.Value;
    }
    return field;
}

function numberOf(field) {
    const raw = valueOf(field, 0);
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : 0;
}

function toInventoryRow(record) {
    return {
        InventoryID: { value: record.inventory_id ?? "" },
        Description: { value: record.description ?? "" },
        SiteID: { value: record.site_id ?? "" },
        OnHand: { value: record.on_hand ?? 0 },
        Available: { value: record.available ?? 0 },
        AvailForShip: { value: record.avail_for_ship ?? 0 },
        DefaultPrice: { value: record.default_price ?? 0 },
        ItemClass: { value: record.item_class ?? "" },
        Branch: { value: record.branch ?? record.site_id ?? "" },
    };
}

function createDb() {
    fs.mkdirSync(DB_DIR, { recursive: true });

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.exec(`
        CREATE TABLE IF NOT EXISTS inventory_cache (
            inventory_id TEXT NOT NULL,
            site_id TEXT NOT NULL DEFAULT '',
            description TEXT,
            branch TEXT,
            on_hand REAL NOT NULL DEFAULT 0,
            available REAL NOT NULL DEFAULT 0,
            avail_for_ship REAL NOT NULL DEFAULT 0,
            default_price REAL NOT NULL DEFAULT 0,
            item_class TEXT,
            synced_at TEXT NOT NULL,
            PRIMARY KEY (inventory_id, site_id)
        )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_cache_branch ON inventory_cache(branch)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_cache_description ON inventory_cache(description)");
    return db;
}

const globalKey = "__inventoryCacheDb";

function getDb() {
    if (!globalThis[globalKey]) {
        globalThis[globalKey] = createDb();
    }
    return globalThis[globalKey];
}

export function upsertInventoryRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return 0;

    const db = getDb();
    const now = new Date().toISOString();
    const upsert = db.prepare(`
        INSERT INTO inventory_cache (
            inventory_id,
            site_id,
            description,
            branch,
            on_hand,
            available,
            avail_for_ship,
            default_price,
            item_class,
            synced_at
        ) VALUES (
            @inventory_id,
            @site_id,
            @description,
            @branch,
            @on_hand,
            @available,
            @avail_for_ship,
            @default_price,
            @item_class,
            @synced_at
        )
        ON CONFLICT(inventory_id, site_id) DO UPDATE SET
            description = excluded.description,
            branch = excluded.branch,
            on_hand = excluded.on_hand,
            available = excluded.available,
            avail_for_ship = excluded.avail_for_ship,
            default_price = excluded.default_price,
            item_class = excluded.item_class,
            synced_at = excluded.synced_at
    `);

    const writeMany = db.transaction((inputRows) => {
        for (const row of inputRows) {
            const inventoryId = String(valueOf(row.InventoryID, "")).trim();
            if (!inventoryId) continue;

            const siteId = String(valueOf(row.SiteID, "")).trim();
            upsert.run({
                inventory_id: inventoryId,
                site_id: siteId,
                description: String(valueOf(row.Description, "")),
                branch: String(valueOf(row.Branch, siteId)),
                on_hand: numberOf(row.OnHand),
                available: numberOf(row.Available),
                avail_for_ship: numberOf(row.AvailForShip),
                default_price: numberOf(row.DefaultPrice),
                item_class: String(valueOf(row.ItemClass, "")),
                synced_at: now,
            });
        }
    });

    writeMany(rows);
    return rows.length;
}

export function getCachedInventoryPage({ page, pageSize, search = "", branch = "" }) {
    const db = getDb();
    const params = [];
    const where = [];

    if (search) {
        const pattern = `%${search.toLowerCase()}%`;
        where.push("(LOWER(inventory_id) LIKE ? OR LOWER(description) LIKE ?)");
        params.push(pattern, pattern);
    }

    if (branch) {
        where.push("LOWER(branch) = ?");
        params.push(branch.toLowerCase());
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const offset = Math.max(0, (page - 1) * pageSize);

    const totalRow = db.prepare(`SELECT COUNT(*) AS totalCount FROM inventory_cache ${whereClause}`).get(...params);
    const totalCount = Number(totalRow?.totalCount || 0);

    const records = db.prepare(`
        SELECT
            inventory_id,
            site_id,
            description,
            branch,
            on_hand,
            available,
            avail_for_ship,
            default_price,
            item_class
        FROM inventory_cache
        ${whereClause}
        ORDER BY inventory_id ASC, site_id ASC
        LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return {
        data: records.map(toInventoryRow),
        totalCount,
        hasMore: offset + records.length < totalCount,
        page,
        pageSize,
        source: "sqlite-cache",
    };
}