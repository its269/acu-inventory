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
    }
};
