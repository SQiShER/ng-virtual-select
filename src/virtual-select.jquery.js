(function($) {
  const pluginName = `virtualselect`;
  const defaults = {};
  const Keys = {
    ArrowUp: 38,
    ArrowDown: 40,
    Enter: 13,
    Escape: 27,
    Control: 17
  };

  class ItemModel {
    constructor(value, index) {
      this.index = index;
      this.value = value;
    }
  }

  class Plugin {
    constructor(element, options) {
      this.$element = $(element);
      this.options = $.extend({}, defaults, options);
      this.scrollTop = 0;
      this.activeItemIndex = 0;
      this.clickedOutsideElement = true;
      this.selectedItem = this.options.selectedItem || null;
      this.previousSearch = '';
      this.itemsLoaded = false;
      const itemHeight = this.options.itemHeight > 0 ? this.options.itemHeight : this.detectItemHeight();
      this.itemOptions = {
        height: itemHeight,
        maxVisible: 10,
        maxRendered: 30
      };
      this.lastKnownMousePosition = {
        x: 0,
        y: 0
      };
      this.init();
    }

    detectItemHeight() {
      const $sampleItem = $('<div class="ui-virtual-select--item">Text</div>').hide().appendTo("body");
      const height = $sampleItem.outerHeight();
      $sampleItem.remove();
      return height;
    }

    init() {
      this.$document = $(document);
      this.$container = $('<div/>').addClass('ui-virtual-select');
      this.$searchInput = $('<input type="text"/>').addClass('ui-virtual-select--search-input').attr('placeholder', 'TODO');
      this.$loadingIndicator = $('<div/>').addClass('ui-virtual-select--loading-indicator').text('Loading...').hide();
      this.$items = $('<div/>').addClass('ui-virtual-select--items').css('overflow-y', 'scroll').hide();
      this.$canvas = $('<div/>').addClass('ui-virtual-select--canvas');
      this.$container.append(this.$searchInput, this.$loadingIndicator, this.$items);
      this.$items.append(this.$canvas);
      this.$element.empty();
      this.$element.append(this.$container);
      this.updateSearchInputPlaceholder();
      this.$searchInput.on('focus', () => {
        this.loadItems().then(() => {
          this.updateItems();
          this.showItems();
          this.adjustScrollPosition();
        });
        this.$searchInput.on('blur', () => {
          if (this.clickedOutsideElement) {
            this.clearSearchInput(true);
            this.hideItems();
          }
          this.$searchInput.off('keydown keyup blur');
          this.$document.off('mousedown');
        });
        this.$searchInput.on('keyup', event => {
          let search = $(event.target).val();
          if (search !== this.previousSearch) {
            this.options.dataProvider.filter(search);
            this.previousSearch = search;
            this.activeItemIndex = 0;
            this.updateItems();
            this.scrollTo(0);
          }
        });
        this.$searchInput.on('keydown', event => {
          switch (event.which) {
            case Keys.ArrowUp:
              return this.activatePreviousItem();
            case Keys.ArrowDown:
              return this.activateNextItem();
            case Keys.Enter:
              return this.selectActiveItem();
            case Keys.Escape:
              return this.cancel();
            case Keys.Control:
              this.extendedModeEnabled = !this.extendedModeEnabled;
              this.forceRender = true;
              this.updateItems();
              break;
            default:
              this.clickedOutsideElement = true;
          }
        });
        this.$document.on('mousedown', event => {
          this.clickedOutsideElement = !$.contains(this.$element[0], event.target);
        });
      });
      this.$items.on('scroll', _.throttle(() => {
        this.scrollTop = this.$items.scrollTop();
        this.updateItems();
      }, 10));
      this.$canvas.on('mousemove', _.throttle(event => {
        this.lastKnownMousePosition.x = event.pageX;
        this.lastKnownMousePosition.y = event.pageY;
      }, 50));
    }

    enableLoadingIndicator() {
      this.$loadingIndicator.show();
      this.$container.addClass('loading');
    }

    disableLoadingIndicator() {
      this.$loadingIndicator.hide();
      this.$container.removeClass('loading');
    }

    loadItems() {
      if (this.itemsLoaded) {
        return Promise.resolve();
      } else {
        this.enableLoadingIndicator();
        return this.options.dataProvider.load().then(() => {
          this.itemsLoaded = true;
          this.disableLoadingIndicator();
        });
      }
    }

    updateItems() {
      this.updateItemModels();
      this.updateItemElements();
      this.updateItemsElementSize();
      this.updateCanvasElementSize();
    }

    updateItemModels() {
      const {height: itemHeight, maxVisible, maxRendered} = this.itemOptions;
      const firstItem = Math.max(Math.floor(this.scrollTop / itemHeight) - maxVisible, 0);
      const items = this.options.dataProvider.get(firstItem, firstItem + maxRendered);
      this.itemModels = items.map((value, index) => new ItemModel(value, firstItem + index));
    }

    updateItemElements() {
      const $itemSet = this.$canvas.children('.ui-virtual-select--item');
      const $activeItem = $itemSet.filter('.active');
      this.itemModels.forEach((itemModel, index) => {
        let $itemElement = this.$canvas.children('.ui-virtual-select--item').eq(index);
        if ($itemElement.length === 0) {
          $itemElement = $(document.createElement('div'))
            .addClass('ui-virtual-select--item')
            .appendTo(this.$canvas)
            .on('mousemove', event => {
              const {x: previousX, y: previousY} = this.lastKnownMousePosition;
              const {pageX: currentX, pageY: currentY} = event;
              // workaround to prevent scripted scrolling from triggering mousemove events
              if (currentX !== previousX || currentY !== previousY) {
                this.activeItemIndex = $(event.currentTarget).data('index');
                this.updateItemElements();
              }
            })
            .on('click', event => {
              this.selectItem($(event.currentTarget).data('index'));
            });
        }
        const {identity: identityFn, displayText: displayTextFn} = this.options.dataProvider;
        const {value: item, index: itemIndex} = itemModel;
        const itemIdentity = identityFn(item);
        if (itemIdentity !== $itemElement.data('identity') || this.forceRender) {
          var displayText = displayTextFn(item, this.extendedModeEnabled);
          $itemElement
            .data('identity', itemIdentity)
            .data('index', itemIndex)
            .data('item', item)
            .attr('title', displayText)
            .text(displayText);
        }
        if (itemIndex === this.activeItemIndex && !$itemElement.hasClass('active')) {
          $activeItem.removeClass('active');
          $itemElement.addClass('active');
        }
      });

      // remove unused elements
      this.$canvas
        .children('.ui-virtual-select--item')
        .slice(this.itemModels.length)
        .remove();

      this.forceRender = false;
    }

    updateItemsElementSize() {
      const {height: itemHeight, maxVisible: itemsVisible} = this.itemOptions;
      const itemsElementHeight = Math.min(itemsVisible, this.totalItemCount) * itemHeight;
      this.$items.css({
        'height': `${itemsElementHeight}px`
      });
    }

    updateCanvasElementSize() {
      const {height: itemHeight, maxVisible: itemsVisible} = this.itemOptions;
      const firstItem = Math.max(Math.floor(this.scrollTop / itemHeight) - itemsVisible, 0);
      const canvasElementMarginTop = firstItem * itemHeight;
      const canvasElementHeight = this.totalItemCount * itemHeight - firstItem * itemHeight;
      this.$canvas.css({
        'height': `${canvasElementHeight}px`,
        'margin-top': `${canvasElementMarginTop}px`
      });
    }

    updateSearchInputPlaceholder() {
      let {selectedItem} = this;
      let displayText;
      if (selectedItem) {
        displayText = this.options.dataProvider.displayText(selectedItem);
      } else {
        displayText = this.options.dataProvider.noSelectionText();
      }
      this.$searchInput.attr('placeholder', displayText);
    }

    get totalItemCount() {
      const {dataProvider = {}} = this.options;
      const {items = []} = dataProvider;
      return items.length;
    }

    showItems() {
      this.$items.show();
      this.$container.addClass('open');
    }

    hideItems() {
      this.$items.hide();
      this.$container.removeClass('open');
    }

    selectItem(index) {
      const itemModel = _.find(this.itemModels, itemModel => itemModel.index === index);
      const item = itemModel.value;
      this.selectedItem = item;
      if (this.options.dataProvider.onSelect) {
        this.options.dataProvider.onSelect(item, index);
      }
      this.updateSearchInputPlaceholder();
      this.clearSearchInput();
      this.hideItems();
    }

    adjustScrollPosition() {
      let scrollIndex = 0;
      if (this.selectedItem) {
        scrollIndex = this.indexOfItem(this.selectedItem);
      }
      this.activeItemIndex = scrollIndex;
      this.updateItems();
      this.scrollTo(scrollIndex);
    }

    indexOfItem(itemToFind) {
      const {items, identity} = this.options.dataProvider;
      return _.findIndex(items, item => identity(item) === identity(itemToFind));
    }

    activatePreviousItem() {
      const {height: itemHeight} = this.itemOptions;
      const firstVisibleItem = Math.ceil((this.scrollTop + itemHeight) / itemHeight) - 1;
      if (this.activeItemIndex > 0) {
        this.activeItemIndex--;
        this.updateItems();
        if (this.activeItemIndex < firstVisibleItem) {
          this.scrollTo(Math.ceil(this.scrollTop / itemHeight) - 1);
        }
      }
    }

    activateNextItem() {
      const {height: itemHeight, maxVisible} = this.itemOptions;
      const lastVisibleItem = Math.floor((this.scrollTop + itemHeight) / itemHeight) + maxVisible - 1;
      if (this.activeItemIndex < this.totalItemCount - 1) {
        this.activeItemIndex++;
        this.updateItems();
        if (this.activeItemIndex >= lastVisibleItem) {
          this.scrollTo(Math.floor(this.scrollTop / itemHeight) + 1);
        }
      }
    }

    selectActiveItem() {
      this.selectItem(this.activeItemIndex);
    }

    cancel() {
      this.clearSearchInput();
      this.hideItems();
      this.activeItemIndex = 0;
    }

    scrollTo(index) {
      this.scrollTop = Math.max(0, index) * this.itemOptions.height;
      this.$items.scrollTop(this.scrollTop);
    }

    clearSearchInput(omitBlur) {
      this.options.dataProvider.filter('');
      this.$searchInput.val('');
      if (!omitBlur) {
        this.$searchInput.trigger('blur');
      }
    }
  }

  $.fn[pluginName] = function(options) {
    return this.each(function() {
      if (!$.data(this, `plugin_${pluginName}`)) {
        $.data(this, `plugin_${pluginName}`, new Plugin(this, options));
      }
    });
  };

})(jQuery);
