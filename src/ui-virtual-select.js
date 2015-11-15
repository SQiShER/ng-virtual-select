'use strict';

angular.module('uiVirtualSelect', [])

  .directive('uiVirtualSelect', ['$timeout', '$document', function($timeout, $document) {

    const Keys = {
      ArrowUp: 38,
      ArrowDown: 40,
      Enter: 13,
      Escape: 27
    };

    function controllerFn() {
      this.formatSearchInput = (item) => {
        if (item) {
          return this.optionsProvider.displayText(item);
        } else {
          if (this.optionsProvider.noSelectionText) {
            return this.optionsProvider.noSelectionText();
          } else {
            return '';
          }
        }
      };
    }

    function linkFn(scope, elem, attrs, [uiVirtualSelectController, ngModelController] , $transclude) {
      const $select = elem.find('.ui-virtual-select');
      const $searchInput = elem.find('.ui-virtual-select--search-input');
      const $canvas = elem.find('.ui-virtual-select--canvas');
      const $loadingIndicator = elem.find('.ui-virtual-select--loading-indicator')
        .hide();
      const $items = elem.find('.ui-virtual-select--items')
        .css('overflow-y', 'scroll')
        .hide();
      const options = {
        itemHeight: detectItemHeight(),
        itemsVisible: 10,
        itemsRendered: 30
      };
      const lastKnownMousePosition = {
        x: 0,
        y: 0
      };
      let scrollTop = 0;
      let previousSearch = '';
      let clickedOutsideElement = true;
      let activeItemIndex = 0;
      let _itemModels = [];

      class ItemModel {
        constructor(value, index) {
          this.index = index;
          this.value = value;
        }
      }

      class LoadingIndicator {
        constructor($loadingIndicator, $select, $template) {
          this.$loadingIndicator = $loadingIndicator;
          this.$select = $select;
          this.loadingClassName = 'loading';
          if ($template.length) {
            $loadingIndicator
              .empty()
              .append($template);
          }
        }
        enable() {
          this.$loadingIndicator.show();
          this.$select.addClass(this.loadingClassName);
        }
        disable() {
          this.$loadingIndicator.hide();
          this.$select.removeClass(this.loadingClassName);
        }
      }

      const loadingIndicator = new LoadingIndicator(
        $loadingIndicator,
        $select,
        $transclude().siblings('nvs-loading-indicator').eq(0)
      );

      $searchInput.on('focus', () => {
        loadingIndicator.enable();
        uiVirtualSelectController.optionsProvider.load().then(() => {
          loadingIndicator.disable();
          updateView();
          open();
          scope.$evalAsync(adjustScrollPosition);
        });

        $searchInput.on('blur', () => {
          if (clickedOutsideElement) {
            clearSearchInput(true);
            close();
          }
          $searchInput.off('keydown keyup blur');
          $document.off('mousedown');
        });

        $searchInput.on('keyup', event => {
          let search = $(event.target).val();
          if (search !== previousSearch) {
            uiVirtualSelectController.optionsProvider.filter(search);
            previousSearch = search;
            activeItemIndex = 0;
            updateView();
            scrollTo(0);
          }
        });

        $searchInput.on('keydown', event => {
          switch (event.which) {
            case Keys.ArrowUp:
              return activatePreviousItem();
            case Keys.ArrowDown:
              return activateNextItem();
            case Keys.Enter:
              return selectActiveItem();
            case Keys.Escape:
              return cancel();
            default:
              clickedOutsideElement = true;
          }
        });

        $document.on('mousedown', event => {
          clickedOutsideElement = !$.contains(elem[0], event.target);
        });
      });

      $items.on('scroll', _.throttle(() => {
        scrollTop = $items.scrollTop();
        updateView();
      }, 10));

      $canvas.on('mousemove', _.throttle(event => {
        lastKnownMousePosition.x = event.pageX;
        lastKnownMousePosition.y = event.pageY;
      }, 50));

      function detectItemHeight() {
        const $sampleItem = $('<div class="ui-virtual-select--item">Text</div>').hide().appendTo("body");
        const height = $sampleItem.outerHeight();
        $sampleItem.remove();
        return height;
      }

      function activatePreviousItem() {
        const {itemHeight} = options;
        const firstVisibleItem = Math.ceil((scrollTop + itemHeight) / itemHeight) - 1;
        if (activeItemIndex > 0) {
          activeItemIndex--;
          updateView();
          if (activeItemIndex < firstVisibleItem) {
            scrollTo(Math.ceil(scrollTop / itemHeight) - 1);
          }
        }
      }

      function activateNextItem() {
        const {itemHeight, itemsVisible} = options;
        const lastVisibleItem = Math.floor((scrollTop + itemHeight) / itemHeight) + itemsVisible - 1;
        if (activeItemIndex < uiVirtualSelectController.optionsProvider.size() - 1) {
          activeItemIndex++;
          updateView();
          if (activeItemIndex >= lastVisibleItem) {
            scrollTo(Math.floor(scrollTop / itemHeight) + 1);
          }
        }
      }

      function selectActiveItem() {
        selectItem(activeItemIndex);
      }

      function cancel() {
        clearSearchInput();
        close();
        activeItemIndex = 0;
      }

      function scrollTo(index) {
        const {itemHeight} = options;
        scrollTop = Math.max(0, index) * itemHeight;
        $items.scrollTop(scrollTop);
      }

      function clearSearchInput(omitBlur) {
        uiVirtualSelectController.optionsProvider.filter('');
        $searchInput.val('');
        if (!omitBlur) {
          $searchInput.trigger('blur');
        }
      }

      function indexOfItem(itemToFind) {
        const {items, identity} = uiVirtualSelectController.optionsProvider;
        return _.findIndex(items, item => identity(item) === identity(itemToFind));
      }

      function updateItemElements() {
        const $itemSet = $canvas.children('.ui-virtual-select--item');
        const $activeItem = $itemSet.filter('.active');
        _itemModels.forEach((itemModel, index) => {
          let $itemElement = $canvas.children('.ui-virtual-select--item').eq(index);
          if ($itemElement.length === 0) {
            $itemElement = $(document.createElement('div'))
              .addClass('ui-virtual-select--item')
              .appendTo($canvas)
              .on('mousemove', event => {
                const {x: previousX, y: previousY} = lastKnownMousePosition;
                const {pageX: currentX, pageY: currentY} = event;
                // workaround to prevent scripted scrolling from triggering mousemove events
                if (currentX !== previousX || currentY !== previousY) {
                  activeItemIndex = $(event.currentTarget).data('index');
                  updateItemElements();
                }
              })
              .on('click', event => {
                selectItem($(event.currentTarget).data('index'));
              });
          }
          const {identity: identityFn, displayText: displayTextFn} = uiVirtualSelectController.optionsProvider;
          const {value: item, index: itemIndex} = itemModel;
          const itemIdentity = identityFn(item);
          if (itemIdentity !== $itemElement.data('identity')) {
            $itemElement
              .data('identity', itemIdentity)
              .data('index', itemIndex)
              .data('item', item)
              .text(displayTextFn(item));
          }
          if (itemIndex === activeItemIndex && !$itemElement.hasClass('active')) {
            $activeItem.removeClass('active');
            $itemElement.addClass('active');
          }
        });

        // remove unused elements
        $canvas
          .children('.ui-virtual-select--item')
          .slice(_itemModels.length)
          .remove();
      }

      function selectItem(index) {
        const itemModel = _itemModels.find(itemModel => itemModel.index === index);
        const item = itemModel.value;
        scope.$apply(() => {
          ngModelController.$setViewValue(item);
          uiVirtualSelectController.selectedItem = item;
          uiVirtualSelectController.onSelectCallback({
            selection: item
          });
        });
        clearSearchInput();
        close();
      }

      function updateView() {
        updateItemModels();
        updateItemElements();
        updateItemsElementSize();
        updateCanvasElementSize();
      }

      function updateItemModels() {
        const {itemHeight, itemsVisible, itemsRendered} = options;
        const firstItem = Math.max(Math.floor(scrollTop / itemHeight) - itemsVisible, 0);
        const items = uiVirtualSelectController.optionsProvider.get(firstItem, firstItem + itemsRendered);
        _itemModels = items.map((value, index) => new ItemModel(value, firstItem + index));
      }

      function updateItemsElementSize() {
        const {itemHeight, itemsVisible} = options;
        const totalItemCount = uiVirtualSelectController.optionsProvider.size();
        const itemsElementHeight = Math.min(itemsVisible, totalItemCount) * itemHeight;
        $items.css({
          'height': `${itemsElementHeight}px`
        });
      }

      function updateCanvasElementSize() {
        const {itemHeight, itemsVisible} = options;
        const firstItem = Math.max(Math.floor(scrollTop / itemHeight) - itemsVisible, 0);
        const totalItemCount = uiVirtualSelectController.optionsProvider.size();
        const canvasElementMarginTop = firstItem * itemHeight;
        const canvasElementHeight = totalItemCount * itemHeight - firstItem * itemHeight;
        $canvas.css({
          'height': `${canvasElementHeight}px`,
          'margin-top': `${canvasElementMarginTop}px`
        });
      }

      scope.$on('ui-virtual-select:focus', () => {
        $searchInput.focus();
      });

      function adjustScrollPosition() {
        let scrollIndex = 0;
        if (uiVirtualSelectController.selectedItem) {
          scrollIndex = indexOfItem(uiVirtualSelectController.selectedItem);
        }
        activeItemIndex = scrollIndex;
        updateView();
        scrollTo(scrollIndex);
      }

      function close() {
        $items.hide();
        $select.removeClass('open');
        uiVirtualSelectController.onCloseCallback();
      }

      function open() {
        $items.show();
        $select.addClass('open');
      }

      ngModelController.$render = () => {
        uiVirtualSelectController.selectedItem = ngModelController.$viewValue;
      };
    }

    return {
      restrict: 'E',
      require: ['uiVirtualSelect', 'ngModel'],
      templateUrl: 'ui-virtual-select.tpl.html',
      controller: controllerFn,
      controllerAs: 'select',
      transclude: true,
      link: linkFn,
      bindToController: true,
      scope: {
        optionsProvider: '=?uiOptionsProvider',
        onSelectCallback: '&uiOnSelect',
        onCloseCallback: '&uiOnClose'
      }
    };
  }]);
