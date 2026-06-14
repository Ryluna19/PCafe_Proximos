// Chave da API. Depois podemos mover isso para uma estrutura com .env.
const API_KEY = "110c493f78ee442f937e3029002de20c";

// Configurações principais da busca
const DEFAULT_RADIUS_METERS = 5000;
const MAX_CUSTOM_RADIUS_KM = 50;
const CACHE_DURATION_MS = 10 * 60 * 1000;

// Status disponíveis para cafés salvos
const STATUS_OPTIONS = [
    { value: "want", label: "Quero visitar" },
    { value: "visited", label: "Já visitei" },
    { value: "liked", label: "Gostei" },
    { value: "avoid", label: "Não voltaria" }
];

let currentCafes = [];

// Inicializa eventos da página
document.addEventListener("DOMContentLoaded", () => {
    const findButton = document.querySelector("#findCafesBtn");
    const savedButton = document.querySelector("#showSavedBtn");
    const clearSavedButton = document.querySelector("#clearSavedBtn");
    const radiusSelect = document.querySelector("#radiusSelect");
    const customRadius = document.querySelector("#customRadius");
    const sortSelect = document.querySelector("#sortSelect");
    const savedSearch = document.querySelector("#savedSearch");
    const savedStatusFilter = document.querySelector("#savedStatusFilter");

    findButton?.addEventListener("click", getLocation);
    savedButton?.addEventListener("click", showSaved);
    clearSavedButton?.addEventListener("click", clearSavedCafes);

    radiusSelect?.addEventListener("change", handleRadiusChange);
    customRadius?.addEventListener("input", updateRadiusLabel);

    sortSelect?.addEventListener("change", () => {
        if (currentCafes.length > 0) {
            displayCards(currentCafes);
        }
    });

    savedSearch?.addEventListener("input", filterSavedCafes);
    savedStatusFilter?.addEventListener("change", filterSavedCafes);

    updateStats();
    updateRadiusLabel();
});

// Atualiza a mensagem de feedback na tela
function setMessage(text) {
    const message = document.querySelector("#message");

    if (message) {
        message.textContent = text;
    }
}

// Ativa/desativa os botões principais durante carregamento
function setLoading(isLoading) {
    const buttons = document.querySelectorAll(".js-main-action");

    buttons.forEach((button) => {
        button.disabled = isLoading;
    });
}

// Busca os cafés salvos no localStorage
function getSavedCafes() {
    const saved = JSON.parse(localStorage.getItem("savedCafes") || "[]");

    return saved.map((cafe) => ({
        ...cafe,
        visitStatus: cafe.visitStatus || "want",
        notes: cafe.notes || ""
    }));
}

// Salva a lista de cafés no localStorage
function setSavedCafes(cafes) {
    localStorage.setItem("savedCafes", JSON.stringify(cafes));
    updateStats();
}

// Atualiza os números do painel de estatísticas
function updateStats(found = null) {
    const saved = getSavedCafes();
    const foundCount = document.querySelector("#foundCount");
    const savedCount = document.querySelector("#savedCount");

    if (foundCount && found !== null) {
        foundCount.textContent = found;
    }

    if (savedCount) {
        savedCount.textContent = saved.length;
    }
}

// Mostra ou oculta a barra da tela de favoritos
function showSavedToolbar(shouldShow) {
    const toolbar = document.querySelector("#savedToolbar");

    if (!toolbar) {
        return;
    }

    toolbar.classList.toggle("hidden", !shouldShow);
}

// Controla o campo de raio personalizado
function handleRadiusChange() {
    const radiusSelect = document.querySelector("#radiusSelect");
    const customRadius = document.querySelector("#customRadius");

    if (!radiusSelect || !customRadius) {
        return;
    }

    const isCustom = radiusSelect.value === "custom";

    customRadius.classList.toggle("hidden", !isCustom);

    if (isCustom) {
        customRadius.focus();
    }

    updateRadiusLabel();
}

// Retorna o raio escolhido pelo usuário em metros
function getSelectedRadiusMeters() {
    const radiusSelect = document.querySelector("#radiusSelect");
    const customRadius = document.querySelector("#customRadius");

    if (!radiusSelect) {
        return DEFAULT_RADIUS_METERS;
    }

    if (radiusSelect.value === "custom") {
        const customKm = Number(customRadius?.value);

        if (!customKm || customKm < 1) {
            return DEFAULT_RADIUS_METERS;
        }

        const limitedKm = Math.min(customKm, MAX_CUSTOM_RADIUS_KM);

        return limitedKm * 1000;
    }

    return Number(radiusSelect.value);
}

// Atualiza o texto do raio no painel de estatísticas
function updateRadiusLabel() {
    const radiusLabel = document.querySelector("#radiusLabel");
    const radiusMeters = getSelectedRadiusMeters();
    const radiusKm = radiusMeters / 1000;

    if (radiusLabel) {
        radiusLabel.textContent = `${radiusKm}km`;
    }
}

// Retorna o tipo de ordenação selecionado
function getSelectedSort() {
    const sortSelect = document.querySelector("#sortSelect");

    return sortSelect?.value || "distance-asc";
}

// Ordena cafés por distância ou nome
function sortCafes(cafes) {
    const sortType = getSelectedSort();

    const sorted = [...cafes];

    if (sortType === "distance-asc") {
        return sorted.sort((a, b) => (a.distance || 999) - (b.distance || 999));
    }

    if (sortType === "distance-desc") {
        return sorted.sort((a, b) => (b.distance || 0) - (a.distance || 0));
    }

    if (sortType === "name-asc") {
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    return sorted;
}

// Pega localização do usuário e usa cache por alguns minutos
function getLocation() {
    showSavedToolbar(false);
    setMessage("Buscando sua localização...");
    setLoading(true);

    const selectedRadius = getSelectedRadiusMeters();
    updateRadiusLabel();

    const cache = JSON.parse(localStorage.getItem("cachedLocation") || "{}");
    const now = Date.now();

    if (cache.timestamp && now - cache.timestamp < CACHE_DURATION_MS) {
        useLocation(cache.lat, cache.lng, selectedRadius);
        return;
    }

    if (!navigator.geolocation) {
        setLoading(false);
        setMessage("Seu navegador não oferece suporte à geolocalização.");
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

            useLocation(lat, lng, selectedRadius);
        },
        (err) => {
            console.error(err);
            setLoading(false);

            showSearchAgainState(
                "Não foi possível acessar sua localização. Permita o acesso à localização no navegador e tente novamente."
            );
        }
    );
}

// Consulta a API da Geoapify usando latitude, longitude e raio
async function useLocation(lat, lng, radiusMeters = DEFAULT_RADIUS_METERS) {
    try {
        setMessage("Procurando cafés próximos...");

        const response = await fetch(
            `https://api.geoapify.com/v2/places?categories=catering.cafe&filter=circle:${lng},${lat},${radiusMeters}&limit=20&apiKey=${API_KEY}`
        );

        if (!response.ok) {
            throw new Error("Erro ao consultar a API de lugares.");
        }

        const data = await response.json();
        const features = data.features || [];

        const cafes = features.map((place) => {
            const props = place.properties || {};
            const cafeLat = props.lat;
            const cafeLon = props.lon;

            const hasCoords =
                Number.isFinite(cafeLat) &&
                Number.isFinite(cafeLon);

            return {
                name: props.name || "Café sem nome",
                place_id: props.place_id || generateId(),
                address:
                    props.address_line1 ||
                    props.formatted ||
                    "Endereço indisponível",
                city:
                    props.city ||
                    props.county ||
                    "Cidade não informada",
                category: formatCategory(props.categories),
                lat: cafeLat,
                lon: cafeLon,
                distance: hasCoords
                    ? getDistanceInKm(lat, lng, cafeLat, cafeLon)
                    : null,
                visitStatus: "want",
                notes: ""
            };
        });

        currentCafes = cafes;

        updateStats(cafes.length);
        displayCards(cafes);
        setLoading(false);
    } catch (err) {
        console.error(err);
        setLoading(false);
        setMessage("Falha ao carregar cafés. Tente novamente em alguns instantes.");
    }
}

// Renderiza os cards encontrados
function displayCards(cafes) {
    const container = document.querySelector(".cards");

    if (!container) {
        console.error("Missing .cards container");
        return;
    }

    showSavedToolbar(false);

    container.classList.remove("saved-mode");
    container.innerHTML = "";

    const sortedCafes = sortCafes(cafes);

    if (!sortedCafes.length) {
        showSearchAgainState("Nenhum café foi encontrado perto de você no momento.");
        setMessage("Tente buscar novamente com um raio maior.");
        return;
    }

    sortedCafes.forEach((cafe, index) => {
        const wrapper = document.createElement("div");

        wrapper.className = "swipe-wrapper";
        wrapper.style.zIndex = sortedCafes.length - index;

        const card = createCafeCard(cafe, { swipeMode: true });

        wrapper.appendChild(card);
        container.appendChild(wrapper);

        addSwipeEvents(wrapper, cafe);
    });

    setMessage("Arraste para a direita para salvar ou para a esquerda para pular.");
}

// Cria um card de café, usado tanto na busca quanto nos salvos
function createCafeCard(cafe, options = {}) {
    const card = document.createElement("article");

    card.className = "location-card";

    const distanceText = cafe.distance
        ? `${cafe.distance.toFixed(1)} km de distância`
        : "Distância não informada";

    const mapsUrl = getMapsUrl(cafe);
    const statusLabel = getStatusLabel(cafe.visitStatus);
    const visual = getCafeVisual(cafe);

    card.innerHTML = `
        <div class="card-visual ${visual.className}">
    <div>
        <span>${visual.icon}</span>
        <small>${visual.label}</small>
    </div>
    </div>

        <div class="card-content">
            <span class="badge">
                ${options.swipeMode ? "📍" : "⭐"} 
                ${options.swipeMode ? escapeHTML(distanceText) : escapeHTML(statusLabel)}
            </span>

            <h3>${escapeHTML(cafe.name)}</h3>

            <p>📍 ${escapeHTML(cafe.address || "Endereço indisponível")}</p>
            <p>🏙️ ${escapeHTML(cafe.city || "Cidade não informada")}</p>
            <p>🏷️ ${escapeHTML(cafe.category || "Café")}</p>

            ${options.swipeMode
            ? `
                        <p class="hint">Swipe: direita salva • esquerda pula</p>

                        <div class="card-actions">
                            <button class="card-action skip-btn" type="button">
                                Pular
                            </button>

                            <button class="card-action save-btn" type="button">
                                Salvar
                            </button>
                        </div>
                    `
            : `
                        <section class="saved-details">
                            <label class="status-control">
                                <span>Status pessoal</span>

                                <select class="status-select">
                                    ${getStatusOptionsHTML(cafe.visitStatus)}
                                </select>
                            </label>

                            <label class="notes-field">
                                <span>Observações</span>

                                <textarea 
                                    class="notes-input" 
                                    maxlength="180" 
                                    placeholder="Ex: parece bom para estudar, trabalhar remoto ou ir no fim de semana..."
                                >${escapeHTML(cafe.notes || "")}</textarea>
                            </label>
                        </section>

                        <p class="saved-meta">
                                Salvo em ${escapeHTML(formatSavedDate(cafe.savedAt))}
                            </p>

                            <div class="card-actions">
                                <a class="card-action map-btn" href="${escapeHTML(mapsUrl)}" target="_blank" rel="noopener noreferrer">
                                    Abrir rota
                                </a>

                                <button class="card-action copy-btn" type="button">
                                    Copiar endereço
                                </button>
                            </div>

                            <button class="delete-btn" type="button">
                                Remover
                            </button>
                                                `
        }
                                    </div>
    `;

    if (options.swipeMode) {
        setupSearchCardActions(card, cafe);
    } else {
        setupSavedCardActions(card, cafe);
    }

    return card;
}

// Configura botões do card na tela de busca
function setupSearchCardActions(card, cafe) {
    const saveButton = card.querySelector(".save-btn");
    const skipButton = card.querySelector(".skip-btn");

    saveButton?.addEventListener("click", () => {
        saveCafe(cafe);

        const wrapper = card.closest(".swipe-wrapper");

        if (wrapper) {
            animateAndRemove(wrapper, "right");
        }
    });

    skipButton?.addEventListener("click", () => {
        setMessage(`${cafe.name} foi pulado.`);

        const wrapper = card.closest(".swipe-wrapper");

        if (wrapper) {
            animateAndRemove(wrapper, "left");
        }
    });
}

// Configura botões e campos do card salvo
function setupSavedCardActions(card, cafe) {
    const deleteButton = card.querySelector(".delete-btn");
    const statusSelect = card.querySelector(".status-select");
    const notesInput = card.querySelector(".notes-input");
    const copyButton = card.querySelector(".copy-btn");

    deleteButton?.addEventListener("click", () => {
        removeCafe(cafe.place_id);
    });

    statusSelect?.addEventListener("change", (event) => {
        updateSavedCafe(cafe.place_id, {
            visitStatus: event.target.value
        });

        setMessage(`${cafe.name} foi atualizado.`);
        renderSavedCafes(getSavedSearchValue(), getSavedStatusFilter());
    });

    notesInput?.addEventListener("change", (event) => {
        updateSavedCafe(cafe.place_id, {
            notes: event.target.value
        });

        setMessage(`Observação de ${cafe.name} salva.`);
    });

    copyButton?.addEventListener("click", () => {
        copyCafeAddress(cafe);
    });
}
// Adiciona eventos de swipe com HammerJS
function addSwipeEvents(wrapper, cafe) {
    if (typeof Hammer === "undefined") {
        return;
    }

    const hammer = new Hammer(wrapper);

    hammer.on("swipeleft", () => {
        setMessage(`${cafe.name} foi pulado.`);
        animateAndRemove(wrapper, "left");
    });

    hammer.on("swiperight", () => {
        saveCafe(cafe);
        animateAndRemove(wrapper, "right");
    });
}

// Anima e remove o card após salvar ou pular
function animateAndRemove(element, direction) {
    const x = direction === "right" ? "150%" : "-150%";
    const rotation = direction === "right" ? "15deg" : "-15deg";

    element.style.transform = `translateX(${x}) rotate(${rotation})`;
    element.style.opacity = "0";

    setTimeout(() => {
        element.remove();
        checkIfSearchCardsEnded();
    }, 300);
}

// Verifica se todos os cards da busca foram removidos
function checkIfSearchCardsEnded() {
    const container = document.querySelector(".cards");

    if (!container || container.classList.contains("saved-mode")) {
        return;
    }

    const remainingCards = container.querySelectorAll(".swipe-wrapper").length;

    if (remainingCards === 0) {
        showSearchAgainState("Você chegou ao fim dos cafés encontrados.");
    }
}

// Mostra uma mensagem final com opção de buscar novamente
function showSearchAgainState(text) {
    const container = document.querySelector(".cards");

    if (!container) {
        return;
    }

    container.classList.remove("saved-mode");

    container.innerHTML = `
        <div class="empty-state">
            <p>${escapeHTML(text)}</p>

            <button id="searchAgainBtn" class="primary-btn empty-action" type="button">
                Buscar novamente
            </button>
        </div>
    `;

    const searchAgainButton = document.querySelector("#searchAgainBtn");

    searchAgainButton?.addEventListener("click", getLocation);

    setMessage("Você pode buscar novamente ou alterar o raio de busca.");
}

// Salva um café nos favoritos
function saveCafe(cafe) {
    const saved = getSavedCafes();

    if (!saved.find((item) => item.place_id === cafe.place_id)) {
        saved.push({
            ...cafe,
            visitStatus: "want",
            notes: "",
            savedAt: new Date().toISOString()
        });

        setSavedCafes(saved);
        setMessage(`${cafe.name} foi salvo nos favoritos.`);
    } else {
        setMessage(`${cafe.name} já estava salvo.`);
    }
}

// Mostra os cafés salvos
function showSaved() {
    const searchInput = document.querySelector("#savedSearch");

    if (searchInput) {
        searchInput.value = "";
    }

    showSavedToolbar(true);
    renderSavedCafes();
}

// Renderiza os favoritos com filtro opcional
function renderSavedCafes(filterText = "", statusFilter = "all") {
    const container = document.querySelector(".cards");

    if (!container) {
        return;
    }

    container.classList.add("saved-mode");
    container.innerHTML = "";

    const saved = getSavedCafes();
    const normalizedFilter = filterText.trim().toLowerCase();

    const filtered = saved.filter((cafe) => {
        const searchableText = `
            ${cafe.name || ""}
            ${cafe.city || ""}
            ${cafe.address || ""}
            ${cafe.category || ""}
            ${getStatusLabel(cafe.visitStatus)}
            ${cafe.notes || ""}
        `.toLowerCase();

        const matchesText = searchableText.includes(normalizedFilter);
        const matchesStatus =
            statusFilter === "all" || cafe.visitStatus === statusFilter;

        return matchesText && matchesStatus;
    });

    updateStats();

    if (saved.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                Você ainda não salvou nenhum café.
            </div>
        `;

        setMessage("Quando encontrar um café legal, salve para ver aqui depois.");
        return;
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                Nenhum café salvo corresponde aos filtros usados.
            </div>
        `;

        setMessage("Tente buscar por outro nome, cidade, endereço, observação ou status.");
        return;
    }

    filtered.forEach((cafe) => {
        container.appendChild(createCafeCard(cafe, { swipeMode: false }));
    });

    if (normalizedFilter || statusFilter !== "all") {
        setMessage(`${filtered.length} café(s) encontrado(s) com os filtros atuais.`);
    } else {
        setMessage(`Você tem ${saved.length} café(s) salvo(s).`);
    }
}

// Retorna o status selecionado no filtro de salvos
function getSavedStatusFilter() {
    const statusFilter = document.querySelector("#savedStatusFilter");

    return statusFilter ? statusFilter.value : "all";
}

// Retorna o texto atual da busca de salvos
function getSavedSearchValue() {
    const searchInput = document.querySelector("#savedSearch");

    return searchInput ? searchInput.value : "";
}

// Atualiza dados de um café salvo
function updateSavedCafe(placeId, updates) {
    const saved = getSavedCafes().map((cafe) => {
        if (cafe.place_id !== placeId) {
            return cafe;
        }

        return {
            ...cafe,
            ...updates
        };
    });

    setSavedCafes(saved);
}

// Remove um café salvo
function removeCafe(placeId) {
    const saved = getSavedCafes().filter(
        (cafe) => cafe.place_id !== placeId
    );

    setSavedCafes(saved);
    renderSavedCafes(getSavedSearchValue(), getSavedStatusFilter());
}

// Remove todos os cafés salvos
function clearSavedCafes() {
    const saved = getSavedCafes();

    if (saved.length === 0) {
        setMessage("Você ainda não tem cafés salvos para limpar.");
        return;
    }

    const confirmed = confirm("Tem certeza que deseja remover todos os cafés salvos?");

    if (!confirmed) {
        return;
    }

    setSavedCafes([]);
    renderSavedCafes();
    setMessage("Todos os cafés salvos foram removidos.");
}

// Gera URL para abrir o café no Google Maps
function getMapsUrl(cafe) {
    if (cafe.lat && cafe.lon) {
        return `https://www.google.com/maps/search/?api=1&query=${cafe.lat},${cafe.lon}`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cafe.name + " " + cafe.address)}`;
}

// Calcula distância aproximada entre dois pontos
function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const earthRadiusKm = 6371;
    const dLat = degreesToRadians(lat2 - lat1);
    const dLon = degreesToRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(degreesToRadians(lat1)) *
        Math.cos(degreesToRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Converte graus para radianos
function degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
}

// Formata categorias vindas da API
function formatCategory(categories = []) {
    if (!Array.isArray(categories) || categories.length === 0) {
        return "Café";
    }

    const mainCategory = categories.find((category) =>
        category.includes("cafe")
    ) || categories[0];

    return mainCategory
        .replaceAll("catering.", "")
        .replaceAll("_", " ")
        .replaceAll(".", " / ");
}

// Retorna o nome visual de um status
function getStatusLabel(statusValue) {
    const status = STATUS_OPTIONS.find((item) => item.value === statusValue);

    return status ? status.label : "Quero visitar";
}

// Gera as opções do select de status
function getStatusOptionsHTML(selectedStatus) {
    return STATUS_OPTIONS.map((status) => {
        const selected = status.value === selectedStatus ? "selected" : "";

        return `
            <option value="${status.value}" ${selected}>
                ${status.label}
            </option>
        `;
    }).join("");
}

// Gera ID reserva quando a API não fornece place_id
function generateId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }

    return String(Date.now() + Math.random());
}
// Cria uma variação visual para cada café sem usar imagens aleatórias
function getCafeVisual(cafe) {
    const visuals = [
        {
            className: "visual-coffee",
            icon: "☕",
            label: "Coffee Spot"
        },
        {
            className: "visual-brunch",
            icon: "🥐",
            label: "Brunch Place"
        },
        {
            className: "visual-nearby",
            icon: "📍",
            label: "Nearby Cafe"
        },
        {
            className: "visual-pick",
            icon: "🔥",
            label: "Cafe Pick"
        }
    ];

    const baseText = cafe.place_id || cafe.name || "cafe";

    const index = Math.abs(
        baseText
            .split("")
            .reduce((total, char) => total + char.charCodeAt(0), 0)
    ) % visuals.length;

    return visuals[index];
}
// Copia o endereço do café para a área de transferência
async function copyCafeAddress(cafe) {
    const textToCopy = `${cafe.name} - ${cafe.address}`;

    try {
        await navigator.clipboard.writeText(textToCopy);
        setMessage(`Endereço de ${cafe.name} copiado.`);
    } catch (err) {
        console.error(err);
        setMessage("Não foi possível copiar o endereço.");
    }
}

// Formata a data em que o café foi salvo
function formatSavedDate(savedAt) {
    if (!savedAt) {
        return "data não informada";
    }

    const date = new Date(savedAt);

    if (Number.isNaN(date.getTime())) {
        return "data não informada";
    }

    return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

// Evita inserção insegura de HTML vindo da API
function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}