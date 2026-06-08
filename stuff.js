function getLocation() {
    console.log("Button clicked");
    const cache = JSON.parse(localStorage.getItem("cachedLocation") || "{}");
    const now = Date.now();

    if (cache.timestamp && now - cache.timestamp < 10 * 60 * 1000) {
        useLocation(cache.lat, cache.lng);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            localStorage.setItem(
                "cachedLocation",
                JSON.stringify({ lat, lng, timestamp: now })
            );
            useLocation(lat, lng);
        },
        (err) => {
            console.error(err);
            alert("Location access denied or unavailable.");
        }
    );
}

async function useLocation(lat, lng) {
    try {
        const response = await fetch(
            `https://api.geoapify.com/v2/places?categories=catering.cafe&filter=circle:${lng},${lat},5000&limit=20&apiKey=110c493f78ee442f937e3029002de20c`
        );

        const data = await response.json();

       const cafes = data.features.map(place => ({
    name: place.properties.name || "Unnamed Cafe",
    place_id: place.properties.place_id || String(Math.random()),

    photo: `https://picsum.photos/400/250?random=${Math.floor(Math.random() * 10000)}`,

    rating: "N/A",

    address:
        place.properties.address_line1 ||
        place.properties.formatted ||
        "Address unavailable",

    city:
        place.properties.city ||
        place.properties.county ||
        "",

    category:
        place.properties.categories?.[0] ||
        "Cafe",

    lat: place.properties.lat,
    lon: place.properties.lon
}));

        displayCards(cafes);
    } catch (err) {
        console.error(err);
        alert("Failed to load cafes.");
    }
}
function displayCards(cafes) {
    const container = document.querySelector(".cards");
    if (!container) {
        console.error("Missing .cards container");
        return;
    }

    container.innerHTML = "";

    cafes.forEach((cafe, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "swipe-wrapper";
        wrapper.style.zIndex = cafes.length - index;

        const card = document.createElement("div");
        card.className = "location-card";

        const cafeData = {
    name: cafe.name,
    place_id: cafe.place_id,
    photo: cafe.photo,
    rating: cafe.rating,

    address: cafe.address,
    city: cafe.city,
    category: cafe.category,

    lat: cafe.lat,
    lon: cafe.lon
};

        card.innerHTML = `
    <img src="${cafe.photo}" alt="${cafe.name}">

    <h3>${cafe.name}</h3>

    <p>📍 ${cafe.address}</p>

    <p>🏙️ ${cafe.city}</p>

    <p>🏷️ ${cafe.category}</p>

    <p><small>Swipe right to save 💖</small></p>
`;

        wrapper.appendChild(card);
        container.appendChild(wrapper);

        if (typeof Hammer !== "undefined") {
            const hammer = new Hammer(wrapper);

            hammer.on("swipeleft", () => {
                wrapper.style.transform = "translateX(-150%) rotate(-15deg)";
                wrapper.style.opacity = "0";
                setTimeout(() => {
                    wrapper.remove();
                }, 300);
            });

            hammer.on("swiperight", () => {
                saveCafe(JSON.stringify(cafeData));
                wrapper.style.transform = "translateX(150%) rotate(15deg)";
                wrapper.style.opacity = "0";
                setTimeout(() => {
                    wrapper.remove();
                }, 300);
            });
        }
    });
}

function saveCafe(cafeJSON) {
    const cafe = JSON.parse(cafeJSON);
    let saved = JSON.parse(localStorage.getItem("savedCafes") || "[]");

    if (!saved.find((c) => c.place_id === cafe.place_id)) {
        saved.push(cafe);
        localStorage.setItem("savedCafes", JSON.stringify(saved));
        alert(`${cafe.name} saved!`);
    } else {
        alert(`${cafe.name} is already saved.`);
    }
}

function showSaved() {
    const container = document.querySelector(".cards");
    if (!container) {
        return;
    }

    container.innerHTML = "";
    const saved = JSON.parse(localStorage.getItem("savedCafes") || "[]");

    if (saved.length === 0) {
        container.innerHTML = "<p>No saved cafes yet 😢</p>";
        return;
    }

    saved.forEach((cafe) => {
        const card = document.createElement("div");
        card.className = "location-card";
        card.innerHTML = `
    <img src="${cafe.photo}" alt="${cafe.name}">

    <h3>${cafe.name}</h3>

    <p>📍 ${cafe.address || ""}</p>

    <p>🏙️ ${cafe.city || ""}</p>

    <p>🏷️ ${cafe.category || ""}</p>

    <button class="delete-btn"
        onclick="removeCafe('${cafe.place_id}')">
        🗑️ Remove
    </button>
`;
        container.appendChild(card);
    });
}

function removeCafe(placeId) {
    let saved = JSON.parse(
        localStorage.getItem("savedCafes") || "[]"
    );

    saved = saved.filter(
        (cafe) => cafe.place_id !== placeId
    );

    localStorage.setItem(
        "savedCafes",
        JSON.stringify(saved)
    );

    showSaved(); // Atualiza a lista na tela
}