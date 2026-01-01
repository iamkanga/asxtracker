// --- COPY ALL CODE BELOW THIS LINE ---

console.log("🔎 STARTING API DIAGNOSTIC...");

// The API URL used by your app
const URL = "https://script.google.com/macros/s/AKfycbwwwMEss5DIYblLNbjIbt_TAzWh54AwrfQlVwCrT_P0S9xkAoXhAUEUg7vSEPYUPOZp/exec?stockCode=JHPI";

fetch(URL)
    .then(response => response.json())
    .then(data => {
        // The API returns an array, so take the first item
        const item = Array.isArray(data) ? data[0] : data;

        console.log("📊 RAW DATA RECEIVED FOR JHPI:");
        console.log("--------------------------------------------------");
        console.log("💲 Live Price: ", item.LivePrice);
        console.log("📈 High 52 (Raw): ", item.High52);
        console.log("📉 Low 52 (Raw):  ", item.Low52);
        console.log("--------------------------------------------------");
        console.log("Full Object:", item);

        // Check against expected values
        const expectedHigh = 54.1;
        const expectedLow = 45.31;

        const isHighGood = Math.abs(item.High52 - expectedHigh) < 0.1;
        const isLowGood = Math.abs(item.Low52 - expectedLow) < 0.1;

        if (isHighGood && isLowGood) {
            console.log("%c✅ SUCCESS: The App is receiving the CORRECT Manual Data.", "color: green; font-weight: bold; font-size: 14px;");
            console.log("If the UI still looks wrong, it might be a caching issue. Try clearing cache.");
        } else {
            console.log("%c❌ FAILURE: The App is receiving OLD or PROXY data.", "color: red; font-weight: bold; font-size: 14px;");
            console.log(`Expected High: ${expectedHigh} | Received: ${item.High52}`);
            console.log(`Expected Low: ${expectedLow} | Received: ${item.Low52}`);
            console.log("👉 This confirms the Web App Update has NOT reached this device yet.");
        }
    })
    .catch(err => {
        console.error("❌ ERROR Fetching Data:", err);
    });

// --- COPY END ---
