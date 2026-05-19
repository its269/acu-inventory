import { supabase } from "@/lib/supabase";

export const SupabaseService = {
    /**
     * Fetch inventory with pagination, search, and branch filtering from Supabase
     */
    async getInventory({ page, pageSize, search, branch }) {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        // Base query joining inventory_levels with products
        let query = supabase
            .from('inventory_levels')
            .select(`
                *,
                products (
                    description,
                    default_price,
                    item_class
                )
            `, { count: 'exact' });

        // Branch filter
        if (branch) {
            query = query.eq('branch_id', branch);
        }

        // Search filter (on product description)
        if (search) {
            query = query.ilike('products.description', `%${search}%`);
        }

        const { data, count, error } = await query
            .range(from, to)
            .order('inventory_id', { ascending: true });

        if (error) throw error;

        // Transform Supabase response to match the BFF StockItem structure
        const transformed = data.map(item => ({
            InventoryID: { value: item.inventory_id },
            Description: { value: item.products?.description || "—" },
            SiteID: { value: item.site_id },
            Branch: { value: item.branch_id },
            OnHand: { value: item.on_hand },
            Available: { value: item.available },
            DefaultPrice: { value: item.products?.default_price || 0 },
            ItemClass: { value: item.products?.item_class || "" },
        }));

        return {
            data: transformed,
            totalCount: count,
            hasMore: count > to + 1
        };
    },

    /**
     * Calculate global stats (Total Value, Low Stock, etc.) instantly from Supabase
     */
    async getGlobalStats(branch, search) {
        // We use a separate query for stats to be accurate across all records, not just the page
        let query = supabase
            .from('inventory_levels')
            .select(`
                on_hand,
                products (
                    default_price,
                    description
                )
            `);

        if (branch) query = query.eq('branch_id', branch);
        if (search) query = query.ilike('products.description', `%${search}%`);

        const { data, error } = await query;
        if (error) throw error;

        let totalValue = 0;
        let lowStock = 0;
        let outOfStock = 0;

        for (const item of data) {
            const price = Number(item.products?.default_price || 0);
            const onHand = Number(item.on_hand || 0);

            totalValue += price * onHand;
            if (onHand <= 0) outOfStock++;
            else if (onHand <= 10) lowStock++;
        }

        return {
            totalValue,
            lowStock,
            outOfStock,
            count: data.length
        };
    },

    /**
     * Fetch all stock items across all branches with optional search and pagination
     */
    async getStockItems({ page = 1, pageSize = 50, search = "" } = {}) {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const SELECT_COLS = `
            inventory_id,
            branch_id,
            site_id,
            on_hand,
            available,
            products (
                description,
                default_price,
                item_class
            )
        `;

        let data, count, error;

        if (!search) {
            // No search — simple paginated query
            ({ data, count, error } = await supabase
                .from("inventory_levels")
                .select(SELECT_COLS, { count: "exact" })
                .range(from, to)
                .order("inventory_id", { ascending: true }));

            if (error) throw error;
        } else {
            // Search across inventory_id (direct col) OR products.description (foreign table).
            // PostgREST cannot OR across a parent col and a foreign table col in one query,
            // so we run two queries in parallel and merge the results.

            const [byId, byDesc] = await Promise.all([
                // Match on inventory_id directly
                supabase
                    .from("inventory_levels")
                    .select(SELECT_COLS)
                    .ilike("inventory_id", `%${search}%`),

                // Use !inner so only rows with a matching description are returned
                supabase
                    .from("inventory_levels")
                    .select(`
                        inventory_id,
                        branch_id,
                        site_id,
                        on_hand,
                        available,
                        products!inner (
                            description,
                            default_price,
                            item_class
                        )
                    `)
                    .ilike("products.description", `%${search}%`),
            ]);

            if (byId.error) throw byId.error;
            if (byDesc.error) throw byDesc.error;

            // Merge and deduplicate by the natural composite key
            const seen = new Set();
            const merged = [];
            for (const item of [...(byId.data || []), ...(byDesc.data || [])]) {
                const key = `${item.inventory_id}||${item.branch_id}||${item.site_id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(item);
                }
            }

            merged.sort((a, b) => (a.inventory_id ?? "").localeCompare(b.inventory_id ?? ""));

            count = merged.length;
            data = merged.slice(from, to + 1);
        }

        const items = data.map(item => ({
            inventoryId: item.inventory_id,
            description: item.products?.description || "—",
            itemClass: item.products?.item_class || "—",
            branch: item.branch_id || "—",
            site: item.site_id || "—",
            onHand: item.on_hand ?? 0,
            available: item.available ?? 0,
            price: item.products?.default_price ?? 0,
        }));

        return { items, totalCount: count ?? 0 };
    },
};
