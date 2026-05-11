const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";
const PAGE_SIZE = 500;
const CONCURRENCY = 4; // parallel requests in flight at once

/* ── Flatten one StockItem into warehouse rows ────────── */
function flattenItem(item) {
    const wds = item.WarehouseDetails;
    if (Array.isArray(wds) && wds.length > 0) {
        return wds.map((wh) => {
            const whBranch = wh.Branch?.value || wh.WarehouseID?.value || "";
            return {
                InventoryID: item.InventoryID,
                Description: item.Description,
                SiteID: wh.WarehouseID,
                OnHand: wh.QtyOnHand ?? wh.QtyOnHandUpdated ?? { value: 0 },
                Available: wh.QtyAvailable ?? { value: 0 },
                AvailForShip: wh.QtyAvailableForShipment ?? wh.QtyAvailableforShipment ?? { value: 0 },
                DefaultPrice: item.DefaultPrice,
                ItemClass: item.ItemClass ?? item.ItemClassID,
                Branch: wh.Branch ?? { value: whBranch },
            };
        });
    }
    return [{
        InventoryID: item.InventoryID,
        Description: item.Description,
        SiteID: item.DefaultWarehouse ?? item.DefaultWarehouseID ?? { value: "" },
        OnHand: { value: 0 },
        Available: { value: 0 },
        AvailForShip: { value: 0 },
        DefaultPrice: item.DefaultPrice,
        ItemClass: item.ItemClass ?? item.ItemClassID,
        Branch: { value: "" },
    }];
}

/* ── Fetch one page from Acumatica ────────────────────── */
async function fetchPage(skip, cookie) {
    const url = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=${PAGE_SIZE}&$skip=${skip}`;
    const res = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Cookie: cookie,
        },
    });
    if (res.status === 401) return { status: 401, data: null };
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { status: res.status, data: null, error: text };
    }
    const data = await res.json();
    return { status: 200, data: Array.isArray(data) ? data : [] };
}

export async function GET(request) {
    const cookie = request.headers.get("cookie") || "";

    /* ── Streaming response ─────────────────────────────────
       Sends NDJSON (one JSON row per line) so the dashboard
       can start rendering rows immediately instead of waiting
       for the full dataset to load.
    ─────────────────────────────────────────────────────── */
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            try {
                // Fetch page 0 first to check if there's more data
                const first = await fetchPage(0, cookie);

                if (first.status === 401) {
                    controller.enqueue(encoder.encode(JSON.stringify({ __error: 401 }) + "\n"));
                    controller.close();
                    return;
                }
                if (first.status !== 200) {
                    controller.enqueue(encoder.encode(JSON.stringify({ __error: first.status, message: first.error }) + "\n"));
                    controller.close();
                    return;
                }

                // Stream first page rows immediately — user sees data right away
                for (const item of first.data) {
                    for (const row of flattenItem(item)) {
                        controller.enqueue(encoder.encode(JSON.stringify(row) + "\n"));
                    }
                }

                // If first page wasn't full, we're done
                if (first.data.length < PAGE_SIZE) {
                    controller.close();
                    return;
                }

                // Otherwise fetch remaining pages in parallel batches
                let skip = PAGE_SIZE;
                let done = false;

                while (!done) {
                    // Fire CONCURRENCY pages at once
                    const batch = [];
                    for (let i = 0; i < CONCURRENCY; i++) {
                        batch.push(fetchPage(skip + i * PAGE_SIZE, cookie));
                    }

                    const results = await Promise.all(batch);

                    for (const result of results) {
                        if (result.status === 401) {
                            controller.enqueue(encoder.encode(JSON.stringify({ __error: 401 }) + "\n"));
                            controller.close();
                            return;
                        }
                        if (result.status !== 200 || !result.data) {
                            done = true;
                            break;
                        }

                        for (const item of result.data) {
                            for (const row of flattenItem(item)) {
                                controller.enqueue(encoder.encode(JSON.stringify(row) + "\n"));
                            }
                        }

                        // If any page in the batch returned less than full, we're done
                        if (result.data.length < PAGE_SIZE) {
                            done = true;
                            break;
                        }
                    }

                    skip += CONCURRENCY * PAGE_SIZE;
                }

                controller.close();
            } catch (err) {
                console.error("[inventory stream error]", err);
                controller.enqueue(encoder.encode(JSON.stringify({ __error: 502, message: "Unable to reach Acumatica." }) + "\n"));
                controller.close();
            }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "application/x-ndjson",
            "Transfer-Encoding": "chunked",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no", // Disable Nginx buffering so chunks flow immediately
        },
    });
}

