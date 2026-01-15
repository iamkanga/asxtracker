
const AppStateMock = {
    data: {
        shares: [
            // Scenario 1: Legacy Share in Portfolio (implicit default)
            { id: 's1', shareName: 'CBA', watchlistId: 'portfolio' },
            // Scenario 2: Legacy Share without watchlistId (defaults to portfolio)
            { id: 's2', shareName: 'BHP' },
            // Scenario 3: Share in Custom Watchlist
            { id: 's3', shareName: 'WOW', watchlistId: 'custom-wl-1' },
            // Scenario 4: Share with Array Membership
            { id: 's4', shareName: 'RIO', watchlistId: 'portfolio', watchlistIds: ['portfolio', 'custom-wl-1'] },
            // Scenario 5: Duplicate Documents (Mixed Schema)
            { id: 's5-a', shareName: 'NAB', watchlistId: 'portfolio' },
            { id: 's5-b', shareName: 'NAB', watchlistId: 'custom-wl-1' }
        ],
        watchlists: [
            { id: 'custom-wl-1', name: 'My List', stocks: ['NAB', 'TLS'] } // TLS is implicit
        ]
    }
};

function simulateOpenAddShareModal(input) {
    console.log(`\n--- Testing Input ID: ${input} ---`);

    // Logic extracted from ModalController.openAddShareModal

    const targetShare = AppStateMock.data.shares.find(s => s.id === input);

    if (!targetShare) {
        console.log('Share NOT found');
        return;
    }

    const stockCode = targetShare.shareName;
    console.log(`Found share: ${stockCode} (ID: ${targetShare.id})`);

    const existingMemberships = new Map();

    // 1. Explicit Check
    AppStateMock.data.shares.filter(s => (s.shareName || '').toUpperCase() === (stockCode || '').toUpperCase()).forEach(s => {
        const wId = s.watchlistId || 'portfolio';
        console.log(`  -> Found Explicit Doc ${s.id} in ${wId}`);
        existingMemberships.set(wId, s.id);

        if (Array.isArray(s.watchlistIds)) {
            s.watchlistIds.forEach(id => {
                console.log(`  -> Found Array Member ${id}`);
                existingMemberships.set(id, s.id);
            });
        }
    });

    // 2. Implicit Check
    (AppStateMock.data.watchlists || []).forEach(wl => {
        if (wl.stocks && Array.isArray(wl.stocks)) {
            if (wl.stocks.some(code => code.toUpperCase() === stockCode.toUpperCase())) {
                if (!existingMemberships.has(wl.id)) {
                    console.log(`  -> Found Implicit Member in ${wl.id}`);
                    existingMemberships.set(wl.id, null);
                }
            }
        }
    });

    const activeWatchlistIds = Array.from(existingMemberships.keys());
    console.log('Resulting Watchlists:', activeWatchlistIds);
}

// Run Tests
simulateOpenAddShareModal('s1'); // Expected: ['portfolio']
simulateOpenAddShareModal('s2'); // Expected: ['portfolio']
simulateOpenAddShareModal('s3'); // Expected: ['custom-wl-1']
simulateOpenAddShareModal('s4'); // Expected: ['portfolio', 'custom-wl-1']
simulateOpenAddShareModal('s5-a'); // Expected: ['portfolio', 'custom-wl-1'] (via NAB match)
