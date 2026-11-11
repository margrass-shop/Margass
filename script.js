const dialog=document.querySelector('#reviews');document.querySelector('#reviews-open').addEventListener('click',()=>dialog.showModal());document.querySelectorAll('#reviews .close').forEach(button=>button.addEventListener('click',()=>dialog.close()));dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}});

const catalogDialog = document.querySelector('#scooters');
const partsDialog = document.querySelector('#parts-catalog');
const emptyDialog = document.querySelector('#empty-catalog');
const catalogList = catalogDialog.querySelector('.product-list');
const partFilters = [...partsDialog.querySelectorAll('.parts-filter')];
const categories = [...document.querySelectorAll('.category-interactive')];
const priceFormat = new Intl.NumberFormat('ru-RU');
let catalogRequest;
let specsId = 0;

function parseCsv(csv) {
 const rows = [[]];
 // CSV values can contain commas, escaped quotes and line breaks.
 const tokens = /("(?:[^"]|"")*"|[^",\r\n]*)(,|\r\n|\n|\r|$)/gy;
 const source = csv.replace(/^\uFEFF/, '');
 let offset = 0;
 while (offset < source.length) {
  const token = tokens.exec(source);
  if (!token || !token[0].length) throw new Error('Некорректный CSV');
  const [, value, separator] = token;
  rows.at(-1).push((value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value).trim());
  offset = tokens.lastIndex;
  if (separator && separator !== ',') rows.push([]);
  if (separator === ',' && offset === source.length) rows.at(-1).push('');
 }
 return rows.filter(row => row.some(Boolean));
}

function imageSource(value) {
 const url = new URL(value, location.href);
 if (value.startsWith('assets/') && url.href.startsWith(new URL('assets/', location.href).href)) return url.href;
 if (/^https:\/\//i.test(value) && url.protocol === 'https:') return url.href;
 throw new Error('Некорректная ссылка на фото');
}

function readProducts(csv) {
 const [headers = [], ...rows] = parseCsv(csv);
 const required = ['Артикул', 'Категория', 'Подкатегория', 'Название', 'Тип', 'Показывать', 'Цена', 'Вариант', 'Фото', 'Характеристики', 'Название для заказа'];
 if (!required.every(header => headers.includes(header))) throw new Error('В таблице отсутствуют заголовки каталога');
 const products = new Map();
 for (const row of rows) {
  const entry = Object.fromEntries(headers.map((header, index) => [header, row[index] || '']));
  if (entry.Показывать.toLowerCase() !== 'да') continue;
  const id = entry.Артикул;
  const category = entry.Категория;
  const subcategory = entry.Подкатегория; // Keep empty cells empty; the parts UI handles its own fallback group.
  const name = entry.Название;
  const price = Number(entry.Цена.replace(/[\s₽]/g, '').replace(',', '.'));
  if (!id || !name || !entry.Цена || !Number.isFinite(price) || price < 0 ||
      !categories.some(item => item.querySelector('h3').textContent === category)) {
   throw new Error('Проверьте товар ' + (id || name || category));
  }
  const variant = {
   label: entry.Вариант,
   price,
   photos: entry.Фото.split(/\r?\n/).map(value => value.trim()).filter(Boolean).map(imageSource),
   specs: entry.Характеристики.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
   orderName: entry['Название для заказа'] || name,
  };
  const product = products.get(id) || { category, subcategory, name, type: entry.Тип, variants: [] };
  if (product.category !== category || product.subcategory !== subcategory || product.name !== name ||
      product.variants.some(option => option.label === variant.label || !option.label || !variant.label)) {
   throw new Error('Проверьте варианты товара ' + id);
  }
  product.variants.push(variant);
  products.set(id, product);
 }
 return [...products.values()];
}

function loadCatalog() {
 catalogRequest ??= fetch(catalogSheetUrl.trim() || 'catalog.csv', {
  cache: 'no-store',
  signal: AbortSignal.timeout(10000),
 }).then(response => {
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.text();
 }).then(readProducts).catch(error => {
  catalogRequest = undefined;
  throw error;
 });
 return catalogRequest;
}

function element(tag, className, content) {
 const node = document.createElement(tag);
 if (className) node.className = className;
 if (content) node.textContent = content;
 return node;
}

function renderCard(product, initialVariant = 0) {
 const hasOptions = Boolean(product.variants[0].label);
 const isTire = product.category === 'Запчасти' && product.subcategory === 'Покрышки';
 const card = element('article', 'product-card');
 if (product.type === 'ГИРОСКУТЕР') card.classList.add('hoverboard-card');
 if (isTire) card.classList.add('tire-card');

 const gallery = element('div', 'product-gallery');
 const photo = element('div', 'product-photo');
 const image = element('img', 'product-main');
 image.loading = 'lazy';
 const thumbs = element('div', 'product-thumbs');
 if (isTire || product.type === 'ГИРОСКУТЕР') thumbs.classList.add('hoverboard-thumbs');
 photo.append(image);
 gallery.append(photo, thumbs);

 const info = element('div', 'product-info');
 info.append(element('div', 'product-type', product.type), element('h3', '', product.name));
 const fieldset = element('fieldset', 'variant-select');
 const options = element('div', 'variant-options');
 const wheels = product.type === 'ГИРОСКУТЕР';
 fieldset.append(element('legend', '', wheels ? 'Размер колёс' : 'Вариант'), options);
 if (hasOptions) info.append(fieldset);

 const specs = element('dl');
 specs.id = 'product-specs-' + ++specsId;
 specs.setAttribute('aria-live', 'polite');
 const toggle = element('button', 'product-specs-toggle', 'Показать характеристики');
 toggle.type = 'button';
 toggle.setAttribute('aria-controls', specs.id);
 toggle.setAttribute('aria-expanded', 'false');
 toggle.onclick = () => {
  const expanded = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!expanded));
  toggle.textContent = expanded ? 'Показать характеристики' : 'Скрыть характеристики';
 };

 const purchase = element('div', 'product-purchase');
 const price = element('strong', 'product-price');
 price.setAttribute('aria-live', 'polite');
 const buy = element('a', 'btn product-buy', 'Купить');
 const arrow = element('span', '', '↗');
 arrow.setAttribute('aria-hidden', 'true');
 buy.append(arrow);
 buy.target = '_blank';
 buy.rel = 'noopener noreferrer';
 purchase.append(price, buy);
 info.append(toggle, specs, purchase);
 card.append(gallery, info);

 function selectVariant(variant, activeButton) {
  for (const button of options.children) {
   const active = button === activeButton;
   button.classList.toggle('active', active);
   button.setAttribute('aria-pressed', String(active));
  }
  const currentPhoto = image.getAttribute('src');
  const photos = variant.photos;
  gallery.style.display = photos.length ? '' : 'none';
  if (!photos.length) image.removeAttribute('src');
  thumbs.style.display = photos.length > 1 ? '' : 'none';
  thumbs.replaceChildren();
  const buttons = photos.map((url, index) => {
   const button = element('button', 'product-thumb');
   button.type = 'button';
   button.setAttribute('aria-label', product.name + ' — фото ' + (index + 1));
   const thumbnail = element('img');
   thumbnail.src = url;
   thumbnail.alt = '';
   thumbnail.loading = 'lazy';
   button.append(thumbnail);
   button.onclick = () => selectPhoto(index);
   return button;
  });
  function selectPhoto(index) {
   image.src = photos[index];
   image.alt = buttons[index].getAttribute('aria-label');
   buttons.forEach((button, position) => {
    button.classList.toggle('active', index === position);
    button.setAttribute('aria-pressed', String(index === position));
   });
  }
  thumbs.append(...buttons);
  if (photos.length) selectPhoto(Math.max(0, photos.indexOf(currentPhoto)));

  specs.replaceChildren(...variant.specs.map(line => {
   const divider = line.indexOf(':');
   const row = element('div');
   row.append(element('dt', '', divider < 0 ? line : line.slice(0, divider).trim()),
    element('dd', '', divider < 0 ? '' : line.slice(divider + 1).trim()));
   return row;
  }));
  toggle.style.display = variant.specs.length ? '' : 'none';
  specs.style.display = variant.specs.length ? '' : 'none';
  price.textContent = priceFormat.format(variant.price) + ' ₽';
  const order = [variant.orderName, wheels ? variant.label.replace(/″$/, '') : variant.label].filter(Boolean).join(' ');
  buy.href = 'https://wa.me/79057538954?text=' + encodeURIComponent('Здравствуйте! Интересует ' + order);
  buy.setAttribute('aria-label', 'Купить ' + order + ' — написать в WhatsApp');
 }

 for (const variant of product.variants) {
  const button = element('button', 'variant-button', variant.label);
  button.type = 'button';
  button.onclick = () => selectVariant(variant, button);
  options.append(button);
 }
 selectVariant(product.variants[initialVariant] || product.variants[0], options.children[initialVariant] || options.firstElementChild);
 return card;
}

function showMessage(title, message) {
 emptyDialog.querySelector('h2').textContent = title;
 emptyDialog.querySelector('p').textContent = message;
 emptyDialog.showModal();
}

function selectParts(filter) {
 for (const button of partFilters) {
  const active = button === filter;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
  document.getElementById(button.getAttribute('aria-controls')).hidden = !active;
 }
 partsDialog.scrollTop = 0;
}

for (const button of partFilters) {
 button.addEventListener('click', () => selectParts(button));
}

function renderParts(products) {
 let firstAvailable;
 for (const button of partFilters) {
  const panel = document.getElementById(button.getAttribute('aria-controls'));
  const items = products.filter(product => product.subcategory === button.textContent.trim() ||
   (button.dataset.parts === 'other' && !partFilters.some(filter => filter.textContent.trim() === product.subcategory)));
  panel.classList.toggle('parts-empty', !items.length);
  if (items.length) {
   firstAvailable ??= button;
   const list = element('div', 'product-list');
   list.append(...items.map(product => renderCard(product)));
   panel.replaceChildren(list);
  } else {
   panel.replaceChildren(element('h3', '', button.textContent.trim()), element('p', '', 'Товара нет в наличии'));
  }
 }
 selectParts(firstAvailable);
}

let categoryOpenRequest = 0;

// Start the request while the visitor is viewing the home page.
// A failed preload is retried by the next category click.
loadCatalog().catch(() => {});

for (const category of categories) {
 async function open() {
  const requestId = ++categoryOpenRequest;
  const title = category.querySelector('h3').textContent;
  catalogDialog.querySelector('h2').textContent = title;
  const loading = element('p', 'catalog-loading', 'Загружаем товары…');
  loading.setAttribute('role', 'status');
  loading.style.cssText = 'padding:32px 16px;text-align:center;grid-column:1/-1';
  catalogList.replaceChildren(loading);
  catalogList.setAttribute('aria-busy', 'true');
  if (!catalogDialog.open) catalogDialog.showModal();
  catalogDialog.scrollTop = 0;
  try {
   const products = (await loadCatalog()).filter(product => product.category === title);
   if (requestId !== categoryOpenRequest || !catalogDialog.open) return;
   if (!products.length) {
    catalogDialog.close();
    showMessage(title, 'Товара нет в наличии');
   } else if (category.id === 'parts-open') {
    renderParts(products);
    catalogDialog.close();
    partsDialog.showModal();
    partsDialog.scrollTop = 0;
   } else {
    catalogDialog.querySelector('h2').textContent = title;
    catalogList.replaceChildren(...products.map(product => renderCard(product)));
    catalogDialog.scrollTop = 0;
   }
  } catch (error) {
   console.error('MARGRASS: ошибка загрузки каталога', error);
   if (requestId !== categoryOpenRequest || !catalogDialog.open) return;
   catalogDialog.close();
   showMessage(title, 'Не удалось загрузить каталог. Попробуйте открыть категорию ещё раз.');
  } finally {
   if (requestId === categoryOpenRequest) catalogList.removeAttribute('aria-busy');
  }
 }
 category.addEventListener('click', open);
 category.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
   event.preventDefault();
   open();
  }
 });
}

for (const modal of [catalogDialog, partsDialog, emptyDialog]) {
 modal.querySelector('.catalog-close, .close').addEventListener('click', () => modal.close());
 modal.addEventListener('click', event => {
  if (event.target !== modal) return;
  const bounds = modal.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) modal.close();
 });
}

// Search uses the same current, visible catalogue as the category windows.
function normalizeSearch(value) {
 return String(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}
function findCatalogMatches(products, query) {
 const term = normalizeSearch(query.trim());
 if (!term) return [];
 const byName = [], bySpecs = [], byCategory = [];
 for (const product of products) {
  if (normalizeSearch(product.name).includes(term)) {
   byName.push({product, variantIndex: 0, source: 'name'});
   continue;
  }
  const categoryFields = [product.category, product.subcategory, product.type];
  if (categoryFields.some(value => value && normalizeSearch(value).includes(term))) {
   byCategory.push({product, variantIndex: 0, source: 'category'});
   continue;
  }
  const variantIndex = product.variants.findIndex(variant =>
   variant.specs.some(line => normalizeSearch(line).includes(term)) ||
   normalizeSearch(variant.label).includes(term));
  if (variantIndex !== -1) {
   const variant = product.variants[variantIndex];
   const snippet = variant.specs.find(line => normalizeSearch(line).includes(term)) || 'Вариант: ' + variant.label;
   bySpecs.push({product, variantIndex, source: 'specs', snippet});
  }
 }
 return [...byName, ...byCategory, ...bySpecs];
}
function appendSearchHighlight(parent, text, query) {
 const term = normalizeSearch(query.trim());
 const normalized = normalizeSearch(text);
 let offset = 0, index;
 while (term && (index = normalized.indexOf(term, offset)) !== -1) {
  parent.append(document.createTextNode(text.slice(offset, index)));
  parent.append(element('mark', '', text.slice(index, index + term.length)));
  offset = index + term.length;
 }
 parent.append(document.createTextNode(text.slice(offset)));
}
function initCatalogSearch() {
 const root = document.querySelector('#catalog-search');
 if (!root) return;
 const trigger = root.querySelector('#catalog-search-trigger');
 const panel = root.querySelector('#catalog-search-panel');
 const input = root.querySelector('#catalog-search-input');
 const clear = root.querySelector('#catalog-search-clear');
 const close = root.querySelector('#catalog-search-close');
 const results = root.querySelector('#catalog-search-results');
 const status = root.querySelector('#catalog-search-status');
 const hint = root.querySelector('.catalog-search-hint');
 let updateId = 0;
 let openingSearch = false;
 function dismissResults() { ++updateId; results.hidden = true; status.textContent = ''; }
 function collapse(restoreFocus = false) {
  dismissResults(); animateSearchWidth(false); root.classList.remove('is-open'); panel.inert = true;
  trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger.focus();
 }
 function openResult(match) {
  // Invalidate an unfinished category opening before displaying the chosen item.
  ++categoryOpenRequest;
  const {product, variantIndex} = match;
  catalogDialog.querySelector('h2').textContent = product.category;
  catalogList.removeAttribute('aria-busy');
  catalogList.replaceChildren(renderCard(product, variantIndex));
  if (!catalogDialog.open) catalogDialog.showModal();
  catalogDialog.scrollTop = 0;
  dismissResults();
 }
 async function update() {
  const id = ++updateId;
  const query = input.value.trim();
  clear.hidden = !input.value;
  hint.hidden = false;
  results.replaceChildren(); results.hidden = true;
  if (!query) { status.textContent = ''; return; }
  status.textContent = 'Ищем товары…';
  try {
   const products = await loadCatalog();
   if (id !== updateId || !root.classList.contains('is-open')) return;
   const matches = findCatalogMatches(products, query);
   status.textContent = matches.length ? 'Найдено товаров: ' + matches.length : 'Ничего не найдено. Попробуйте другое название или характеристику.';
   let previousSource;
   for (const match of matches) {
    if (match.source !== previousSource) {
     results.append(element('h3', 'catalog-search-group', ({name: 'Совпадения в названии', specs: 'Совпадения в характеристиках', category: 'Совпадения в категории'})[match.source]));
     previousSource = match.source;
    }
    const {product, variantIndex} = match;
    const variant = product.variants[variantIndex];
    const button = element('button', 'catalog-search-result'); button.type = 'button';
    if (variant.photos[0]) {
     const image = element('img'); image.src = variant.photos[0]; image.alt = ''; image.loading = 'lazy';
     button.append(image);
    }
    const info = element('span', 'catalog-search-result-info');
    const name = element('span', 'catalog-search-result-name');
    appendSearchHighlight(name, product.name, query);
    const categoryText = element('span', 'catalog-search-result-meta');
    const matchedCategory = match.source === 'category' ? [product.subcategory, product.type].find(value => value && normalizeSearch(value).includes(normalizeSearch(query))) : '';
    const categoryLabel = matchedCategory && matchedCategory !== product.category ? product.category + ' · ' + matchedCategory : product.category;
    appendSearchHighlight(categoryText, categoryLabel, query);
    info.append(name, categoryText);
    if (match.snippet) {
     const snippet = element('span', 'catalog-search-result-spec');
     appendSearchHighlight(snippet, match.snippet, query); info.append(snippet);
    }
    const minPrice = Math.min(...product.variants.map(option => option.price));
    const variedPrices = product.variants.some(option => option.price !== minPrice);
    const priceText = match.source !== 'specs' ? (variedPrices ? 'от ' : '') + priceFormat.format(minPrice) : priceFormat.format(variant.price);
    button.append(info, element('span', 'catalog-search-result-price', priceText + ' ₽'));
    button.addEventListener('click', () => openResult(match));
    results.append(button);
   }
   results.hidden = !matches.length;
   results.scrollTop = 0;
  } catch (error) {
   if (id !== updateId) return;
   status.textContent = 'Не удалось загрузить товары. Измените запрос, чтобы повторить поиск.';
  }
 }
 const header = root.closest('.catalog-section-head');
 function animateSearchWidth(expanded) {
  const current = root.getBoundingClientRect().width;
  const target = parseFloat(root.style.getPropertyValue(expanded ? '--search-expanded-width' : '--search-collapsed-width'));
  if (!Number.isFinite(target)) return;
  root.style.width = current + 'px';
  // Commit the current size before changing the target, in both directions.
  void root.offsetWidth;
  root.style.width = target + 'px';
 }
 function measureSearchWidth() {
  if (!header) return;
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  const gap = parseFloat(getComputedStyle(header).columnGap) || 24;
  const available = mobile ? header.clientWidth : header.clientWidth - header.firstElementChild.getBoundingClientRect().width - gap;
  root.style.setProperty('--search-expanded-width', Math.max(0, available) + 'px');
  root.style.setProperty('--search-collapsed-width', Math.min(238, Math.max(0, available)) + 'px');
 }
 measureSearchWidth();
 if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measureSearchWidth).observe(header || root.parentElement);
 else window.addEventListener('resize', measureSearchWidth);
 trigger.addEventListener('click', () => {
  measureSearchWidth(); animateSearchWidth(true); root.classList.add('is-open'); panel.inert = false;
  openingSearch = true;
  trigger.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
   if (root.classList.contains('is-open')) input.focus({preventScroll: true});
   openingSearch = false;
  });
  update();
 });
 input.addEventListener('input', update);
 input.addEventListener('focus', () => { if (input.value.trim()) update(); });
 clear.addEventListener('click', () => { input.value = ''; input.focus(); update(); });
 close.addEventListener('click', () => collapse(true));
 root.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); collapse(true); }
  if (event.key === 'ArrowDown' && event.target === input && !results.hidden) {
   event.preventDefault(); results.querySelector('button')?.focus();
  }
  if (event.target.classList.contains('catalog-search-result')) {
   const buttons = [...results.querySelectorAll('button')];
   const index = buttons.indexOf(event.target);
   if (event.key === 'ArrowDown') { event.preventDefault(); buttons[Math.min(index + 1, buttons.length - 1)]?.focus(); }
   if (event.key === 'ArrowUp') { event.preventDefault(); if (!index) input.focus(); else buttons[index - 1].focus(); }
  }
 });
 document.addEventListener('click', event => { if (!root.contains(event.target)) collapse(); });
 document.addEventListener('focusin', event => { if (!openingSearch && !root.contains(event.target)) collapse(); });
}
initCatalogSearch();
