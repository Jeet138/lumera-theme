class FacetFiltersForm extends HTMLElement {
  constructor() {
    super();

    this.onActiveFilterClick = this.onActiveFilterClick.bind(this);

    this.debouncedOnSubmit = debounce((event) => {
      this.onSubmitHandler(event);
    }, 100);

    const facetForm = this.querySelector('form');
    if (facetForm) {
      facetForm.addEventListener('input', this.debouncedOnSubmit.bind(this));
    }

    const facetWrapper = this.querySelector('#FacetsWrapperDesktop');
    if (facetWrapper) facetWrapper.addEventListener('keyup', onKeyUpEscape);

    const parentElement = document.querySelector('.collection-drawer-collapse-left');
    this.drawerCollapse(parentElement);
  }

  /* custom open drawer */
  drawerCollapse(parentElement) {
    if (parentElement) {
      const btnOpen = this.querySelector('.drawer-collapse-btn');
      const sideBar = parentElement.querySelector('.sidebar-collapse-left');

      if (!btnOpen || !sideBar) {
        return;
      }

      const btnClose = sideBar.querySelector('.btn-close-sidebar-collapse');

      if (!btnClose) {
        return;
      }

      btnOpen.addEventListener('click', function () {
        btnOpen.classList.toggle('open');
        sideBar.classList.toggle('open');
      });

      btnClose.addEventListener('click', function () {
        btnOpen.classList.remove('open');
        sideBar.classList.remove('open');
      });
    }
  }

  static closeDrawer(parentElement) {
    if (parentElement) {
      const btnOpen = parentElement.querySelector('.drawer-collapse-btn');
      const sideBar = parentElement.querySelector('.sidebar-collapse-left');

      if (!btnOpen || !sideBar) {
        return;
      }

      const btnClose = sideBar.querySelector('.btn-close-sidebar-collapse');

      if (!btnClose) {
        return;
      }

      btnClose.addEventListener('click', function () {
        btnOpen.classList.remove('open');
        sideBar.classList.remove('open');
      });
    }
  }

  static setListeners() {
    const onHistoryChange = (event) => {
      const searchParams = event.state
        ? event.state.searchParams
        : FacetFiltersForm.searchParamsInitial;

      if (searchParams === FacetFiltersForm.searchParamsPrev) return;

      FacetFiltersForm.renderPage(searchParams, null, false);
    };

    window.addEventListener('popstate', onHistoryChange);
  }

  static toggleActiveFacets(disable = true) {
    document.querySelectorAll('.js-facet-remove').forEach((element) => {
      element.classList.toggle('disabled', disable);
    });
  }

  /* =========================================================
     RENDER PAGE
     FIXED: Prevent "Cannot read properties of null (classList)"
     ========================================================= */
  static renderPage(searchParams, event, updateURLHash = true) {
    FacetFiltersForm.searchParamsPrev = searchParams;

    const sections = FacetFiltersForm.getSections();
    const countContainer = document.getElementById('ProductCount');
    const countContainerDesktop =
      document.getElementById('ProductCountDesktop');

    const productGridContainer =
      document.getElementById('ProductGridContainer');

    /* SAFE LOADING CLASS */
    if (productGridContainer) {
      const collectionElement =
        productGridContainer.querySelector('.collection');

      if (collectionElement) {
        collectionElement.classList.add('loading');
      } else {
        productGridContainer.classList.add('loading');
      }
    }

    if (countContainer) {
      countContainer.classList.add('loading');
    }

    if (countContainerDesktop) {
      countContainerDesktop.classList.add('loading');
    }

    sections.forEach((section) => {
      if (!section.section) return;

      const url =
        `${window.location.pathname}?section_id=${section.section}&${searchParams}`;

      const filterDataUrl = (element) => element.url === url;

      FacetFiltersForm.filterData.some(filterDataUrl)
        ? FacetFiltersForm.renderSectionFromCache(filterDataUrl, event)
        : FacetFiltersForm.renderSectionFromFetch(url, event);
    });

    if (updateURLHash) {
      FacetFiltersForm.updateURLHash(searchParams);
    }
  }

  static renderSectionFromFetch(url, event) {
  if (FacetFiltersForm.abortController) {
    FacetFiltersForm.abortController.abort();
  }

  FacetFiltersForm.abortController = new AbortController();

  fetch(url, {
    signal: FacetFiltersForm.abortController.signal
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.text();
    })
    .then((html) => {

      FacetFiltersForm.filterData = [
        ...FacetFiltersForm.filterData,
        { html, url }
      ];

      FacetFiltersForm.renderFilters(html, event);
      FacetFiltersForm.renderProductGridContainer(html);
      FacetFiltersForm.renderProductCount(html);

    })
    .catch((error) => {

      if (error.name === 'AbortError') {
        return;
      }

      console.error('Error loading filters:', error);
      FacetFiltersForm.toggleActiveFacets(false);

    });
}
  static renderSectionFromCache(filterDataUrl, event) {
    const cachedData =
      FacetFiltersForm.filterData.find(filterDataUrl);

    if (!cachedData) return;

    const html = cachedData.html;

    FacetFiltersForm.renderFilters(html, event);
    FacetFiltersForm.renderProductGridContainer(html);
    FacetFiltersForm.renderProductCount(html);
  }

  static renderReview() {
    if (window.SPR && theme.review) {
      if ($('.shopify-product-reviews-badge').length > 0) {
        return (
          window.SPR.registerCallbacks(),
          window.SPR.initRatingHandler(),
          window.SPR.initDomEls(),
          window.SPR.loadProducts(),
          window.SPR.loadBadges()
        );
      }
    }

    if (theme.review && typeof jdgm !== 'undefined') {
      return jdgm.customizeBadges();
    }
  }

static renderProductGridContainer(html) {

  /*
   * IMPORTANT:
   * Filter change hone par old Ajaxinate destroy karo.
   */
  if (
    typeof window.destroyCollectionAjaxinate === 'function'
  ) {
    window.destroyCollectionAjaxinate();
  }


  const currentContainer =
    document.getElementById('ProductGridContainer');

  if (!currentContainer) {
    return;
  }


  const parsedHTML =
    new DOMParser().parseFromString(
      html,
      'text/html'
    );


  const newContainer =
    parsedHTML.getElementById(
      'ProductGridContainer'
    );


  if (!newContainer) {
    return;
  }


  /*
   * Replace products + new pagination link
   */
  currentContainer.innerHTML =
    newContainer.innerHTML;


  currentContainer.classList.remove('loading');


  /*
   * IMPORTANT:
   * New filtered products ke liye
   * ONLY ONE Ajaxinate instance create hoga.
   */
  setTimeout(function () {

    if (
      typeof window.initCollectionAjaxinate === 'function'
    ) {
      window.initCollectionAjaxinate();
    }

  }, 50);

}
  /* =========================================================
     PRODUCT COUNT
     FIXED: Safe check for ProductCount / ProductCountDesktop
     ========================================================= */
 static renderProductCount(html) {

  const parsedHTML =
    new DOMParser().parseFromString(
      html,
      'text/html'
    );


  const sourceCount =
    parsedHTML.getElementById(
      'ProductCount'
    );


  const sourceCountDesktop =
    parsedHTML.getElementById(
      'ProductCountDesktop'
    );


  const container =
    document.getElementById(
      'ProductCount'
    );


  const containerDesktop =
    document.getElementById(
      'ProductCountDesktop'
    );


  if (container && sourceCount) {

    container.innerHTML =
      sourceCount.innerHTML;

    container.classList.remove(
      'loading'
    );

  }


  if (containerDesktop) {

    if (sourceCountDesktop) {

      containerDesktop.innerHTML =
        sourceCountDesktop.innerHTML;

    } else if (sourceCount) {

      containerDesktop.innerHTML =
        sourceCount.innerHTML;

    }

    containerDesktop.classList.remove(
      'loading'
    );

  }


  /*
   * DO NOT initialize Ajaxinate here.
   *
   * Ajaxinate is initialized only by:
   * window.initCollectionAjaxinate()
   */


  if (
    typeof theme !== 'undefined' &&
    theme.wishlist &&
    theme.wishlist.load
  ) {
    theme.wishlist.load();
  }


  if (
    typeof theme !== 'undefined' &&
    theme.compare &&
    theme.compare.load
  ) {
    theme.compare.load();
  }


  if (
    typeof theme !== 'undefined' &&
    theme.swatchCard2 &&
    theme.swatchCard2.load
  ) {
    theme.swatchCard2.load();
  }


  FacetFiltersForm.renderReview();

}
  static renderFilters(html, event) {
    const parsedHTML =
      new DOMParser().parseFromString(html, 'text/html');

    const facetDetailsElements =
      parsedHTML.querySelectorAll(
        '#FacetFiltersForm .js-filter, #FacetFiltersFormMobile .js-filter, #FacetFiltersPillsForm .js-filter'
      );

    const matchesIndex = (element) => {
      const jsFilter = event
        ? event.target.closest('.js-filter')
        : undefined;

      return jsFilter
        ? element.dataset.index === jsFilter.dataset.index
        : false;
    };

    const facetsToRender =
      Array.from(facetDetailsElements).filter(
        (element) => !matchesIndex(element)
      );

    const countsToRender =
      Array.from(facetDetailsElements).find(matchesIndex);

    facetsToRender.forEach((element) => {
      const currentElement = document.querySelector(
        `.js-filter[data-index="${element.dataset.index}"]`
      );

      if (currentElement) {
        currentElement.innerHTML = element.innerHTML;
      }
    });

    FacetFiltersForm.renderActiveFacets(parsedHTML);
    FacetFiltersForm.renderAdditionalElements(parsedHTML);

    if (countsToRender && event && event.target) {
      const targetFilter =
        event.target.closest('.js-filter');

      if (targetFilter) {
        FacetFiltersForm.renderCounts(
          countsToRender,
          targetFilter
        );
      }
    }

    const parentElement =
      document.querySelector('.collection-drawer-collapse-left');

    FacetFiltersForm.closeDrawer(parentElement);
  }

  static renderActiveFacets(html) {
    const activeFacetElementSelectors = [
      '.active-facets-mobile',
      '.active-facets-desktop',
    ];

    activeFacetElementSelectors.forEach((selector) => {
      const activeFacetsElement =
        html.querySelector(selector);

      const currentActiveFacetsElement =
        document.querySelector(selector);

      if (
        !activeFacetsElement ||
        !currentActiveFacetsElement
      ) {
        return;
      }

      currentActiveFacetsElement.innerHTML =
        activeFacetsElement.innerHTML;
    });

    FacetFiltersForm.toggleActiveFacets(false);
  }

  static renderAdditionalElements(html) {
    const mobileElementSelectors = [
      '.mobile-facets__open',
      '.mobile-facets__count',
      '.sorting',
    ];

    mobileElementSelectors.forEach((selector) => {
      const sourceElement = html.querySelector(selector);
      const currentElement = document.querySelector(selector);

      if (!sourceElement || !currentElement) return;

      currentElement.innerHTML = sourceElement.innerHTML;
    });

    const mobileForm =
      document.getElementById('FacetFiltersFormMobile');

    if (mobileForm) {
      const menuDrawer =
        mobileForm.closest('menu-drawer');

      if (menuDrawer && menuDrawer.bindEvents) {
        menuDrawer.bindEvents();
      }
    }
  }

  static renderCounts(source, target) {
    if (!source || !target) return;

    const targetElement =
      target.querySelector('.facets__selected');

    const sourceElement =
      source.querySelector('.facets__selected');

    const targetElementAccessibility =
      target.querySelector('.facets__summary');

    const sourceElementAccessibility =
      source.querySelector('.facets__summary');

    if (sourceElement && targetElement) {
      targetElement.outerHTML = sourceElement.outerHTML;
    }

    if (
      targetElementAccessibility &&
      sourceElementAccessibility
    ) {
      targetElementAccessibility.outerHTML =
        sourceElementAccessibility.outerHTML;
    }
  }

  static updateURLHash(searchParams) {
    history.pushState(
      { searchParams },
      '',
      `${window.location.pathname}${
        searchParams ? '?'.concat(searchParams) : ''
      }`
    );
  }

static getSections() {
  const productGrid =
    document.querySelector('#ProductGridContainer .AjaxinateLoop');

  if (!productGrid) {
    return [];
  }

  const sectionId = productGrid.dataset.id;

  if (!sectionId) {
    return [];
  }

  return [
    {
      section: sectionId,
    },
  ];
}

  createSearchParams(form) {
    const formData = new FormData(form);
    return new URLSearchParams(formData).toString();
  }

  onSubmitForm(searchParams, event) {
    FacetFiltersForm.renderPage(searchParams, event);
  }

  onSubmitHandler(event) {
    event.preventDefault();

    const sortFilterForms =
      document.querySelectorAll('facet-filters-form form');

    if (event.srcElement.className === 'mobile-facets__checkbox') {
      const form = event.target.closest('form');

      if (!form) return;

      const searchParams =
        this.createSearchParams(form);

      this.onSubmitForm(searchParams, event);
    } else {
      const forms = [];

      const targetForm =
        event.target.closest('form');

      if (!targetForm) return;

      const isMobile =
        targetForm.id === 'FacetFiltersFormMobile';

      sortFilterForms.forEach((form) => {
        if (!isMobile) {
          if (
            form.id === 'FacetSortForm' ||
            form.id === 'FacetFiltersForm' ||
            form.id === 'FacetSortDrawerForm'
          ) {
            const noJsElements =
              document.querySelectorAll('.no-js-list');

            noJsElements.forEach((el) => el.remove());

            forms.push(
              this.createSearchParams(form)
            );
          }
        } else if (form.id === 'FacetFiltersFormMobile') {
          forms.push(
            this.createSearchParams(form)
          );
        }
      });

      this.onSubmitForm(forms.join('&'), event);
    }
  }

  onActiveFilterClick(event) {
    event.preventDefault();

    FacetFiltersForm.toggleActiveFacets();

    const href = event.currentTarget.href;

    const url =
      href.indexOf('?') === -1
        ? ''
        : href.slice(href.indexOf('?') + 1);

    FacetFiltersForm.renderPage(url);
  }
}

FacetFiltersForm.filterData = [];
FacetFiltersForm.searchParamsInitial =
  window.location.search.slice(1);
FacetFiltersForm.searchParamsPrev =
  window.location.search.slice(1);

customElements.define(
  'facet-filters-form',
  FacetFiltersForm
);

FacetFiltersForm.setListeners();


/* =========================================================
   PRICE RANGE
   ========================================================= */

class PriceRange extends HTMLElement {
  constructor() {
    super();

    this.querySelectorAll('input').forEach((element) =>
      element.addEventListener(
        'change',
        this.onRangeChange.bind(this)
      )
    );

    this.setMinAndMaxValues();
    this.noUifilter();
  }

  connectedCallback() {
    this.noUifilter();
  }

  onRangeChange(event) {
    this.adjustToValidValues(event.currentTarget);
    this.setMinAndMaxValues();
    this.noUifilter();
  }

  setMinAndMaxValues() {
    const inputs = this.querySelectorAll('input');

    const minInput = inputs[0];
    const maxInput = inputs[1];

    if (!minInput || !maxInput) return;

    if (maxInput.value) {
      minInput.setAttribute('max', maxInput.value);
    }

    if (minInput.value) {
      maxInput.setAttribute('min', minInput.value);
    }

    if (minInput.value === '') {
      maxInput.setAttribute('min', 0);
    }

    if (maxInput.value === '') {
      minInput.setAttribute(
        'max',
        maxInput.getAttribute('max')
      );
    }
  }

  adjustToValidValues(input) {
    const value = Number(input.value);
    const min = Number(input.getAttribute('min'));
    const max = Number(input.getAttribute('max'));

    if (value < min) input.value = min;
    if (value > max) input.value = max;
  }

  noUifilter() {
    const sliderRange =
      this.querySelector('.slider-range');

    const inputs = this.querySelectorAll('input');

    const minInput = inputs[0];
    const maxInput = inputs[1];

    if (
      !sliderRange ||
      !minInput ||
      !maxInput ||
      typeof noUiSlider === 'undefined'
    ) {
      return;
    }

    let minValue =
      parseFloat(minInput.value);

    if (isNaN(minValue)) {
      minValue = 0;
    }

    const event =
      new CustomEvent('input');

    const form =
      this.closest('facet-filters-form') ||
      document.querySelector('facet-filters-form');

    if (!sliderRange.classList.contains('noUi-target')) {
      noUiSlider.create(sliderRange, {
        start: [
          minValue,
          maxInput.value === ''
            ? parseFloat(maxInput.getAttribute('max'))
            : parseFloat(maxInput.value),
        ],
        connect: true,
        step: 1,
        range: {
          min: 0,
          max: parseFloat(
            maxInput.getAttribute('max')
          ),
        },
      });

      sliderRange.noUiSlider.on(
        'change',
        function (values, handle) {
          if (handle === 0) {
            minInput.value = values[handle];
          }

          if (handle === 1) {
            maxInput.value = values[handle];
          }
        }
      );

      sliderRange.noUiSlider.on(
        'change',
        function () {
          if (form) {
            const actualForm =
              form.querySelector('form');

            if (actualForm) {
              actualForm.dispatchEvent(event);
            }
          }
        }
      );

      minInput.addEventListener(
        'change',
        function () {
          const minValue =
            parseFloat(minInput.value);

          setTimeout(function () {
            sliderRange.noUiSlider.set([
              minValue,
              null,
            ]);
          }, 0);
        }
      );

      maxInput.addEventListener(
        'change',
        function () {
          const maxValue =
            parseFloat(maxInput.value);

          setTimeout(function () {
            sliderRange.noUiSlider.set([
              null,
              maxValue,
            ]);
          }, 0);
        }
      );
    }
  }
}

customElements.define(
  'price-range',
  PriceRange
);


/* =========================================================
   REMOVE ACTIVE FILTER
   ========================================================= */

class FacetRemove extends HTMLElement {
  constructor() {
    super();

    const facetLink =
      this.querySelector('a');

    if (!facetLink) return;

    facetLink.setAttribute('role', 'button');

    facetLink.addEventListener(
      'click',
      this.closeFilter.bind(this)
    );

    facetLink.addEventListener(
      'keyup',
      (event) => {
        event.preventDefault();

        if (
          event.code &&
          event.code.toUpperCase() === 'SPACE'
        ) {
          this.closeFilter(event);
        }
      }
    );
  }

  closeFilter(event) {
    event.preventDefault();

    const form =
      this.closest('facet-filters-form') ||
      document.querySelector('facet-filters-form');

    if (form && typeof form.onActiveFilterClick === 'function') {
      form.onActiveFilterClick(event);
    }
  }
}

customElements.define(
  'facet-remove',
  FacetRemove
);