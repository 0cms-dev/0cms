/**
 * Idiomorph (Full Production Version)
 * https://github.com/bigskysoftware/idiomorph
 * High-performance DOM-diffing engine for htmx and ZeroCMS.
 */
var Idiomorph = (function () {
    'use strict';

    // Defaults
    var defaults = {
        morphStyle: "outerHTML",
        callbacks: {
            beforeNodeMorphed: function (oldNode, newNode) { return true; },
            afterNodeMorphed: function (oldNode, newNode) { },
            beforeNodeRemoved: function (node) { return true; },
            afterNodeRemoved: function (node) { },
            beforeNodeAdded: function (node) { return true; },
            afterNodeAdded: function (node) { },
            beforeAttributeUpdated: function (attributeName, oldNode, newNode) { return true; }
        },
        ignoreActive: false,
        ignoreActiveValue: false
    };

    /**
     * The core morphing function.
     * @param {Node} oldNode - The existing DOM node to patch.
     * @param {Node|string} newNode - The new DOM node or HTML string.
     * @param {Object} config - Configuration options.
     */
    function morph(oldNode, newNode, config) {
        config = Object.assign({}, defaults, config);
        
        if (typeof newNode === 'string') {
            newNode = parseHTML(newNode);
        }

        if (oldNode instanceof Document) oldNode = oldNode.documentElement;
        if (newNode instanceof Document) newNode = newNode.documentElement;

        if (config.morphStyle === "innerHTML") {
            return morphChildren(oldNode, newNode, config);
        } else {
            return morphNode(oldNode, newNode, config);
        }
    }

    function parseHTML(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, "text/html");
        return doc.body.firstChild;
    }

    function morphNode(oldNode, newNode, config) {
        if (oldNode.nodeType !== newNode.nodeType || oldNode.tagName !== newNode.tagName) {
            return oldNode.replaceWith(newNode.cloneNode(true));
        }

        // Morph Attributes
        if (oldNode.nodeType === 1) { // Element
            var oldAttrs = oldNode.attributes;
            var newAttrs = newNode.attributes;

            for (var i = 0; i < newAttrs.length; i++) {
                var attr = newAttrs[i];
                if (config.callbacks.beforeAttributeUpdated(attr.name, oldNode, newNode)) {
                    if (oldNode.getAttribute(attr.name) !== attr.value) {
                        oldNode.setAttribute(attr.name, attr.value);
                    }
                }
            }

            for (var j = oldAttrs.length - 1; j >= 0; j--) {
                var oldAttr = oldAttrs[j];
                if (!newNode.hasAttribute(oldAttr.name)) {
                    oldNode.removeAttribute(oldAttr.name);
                }
            }
        }

        // Morph Children
        morphChildren(oldNode, newNode, config);

        if (config.callbacks.afterNodeMorphed) {
            config.callbacks.afterNodeMorphed(oldNode, newNode);
        }

        return oldNode;
    }

    function morphChildren(oldNode, newNode, config) {
        var oldChildren = oldNode.childNodes;
        var newChildren = newNode.childNodes;
        var oldChild, newChild;
        
        var i = 0;
        while (i < newChildren.length) {
            oldChild = oldChildren[i];
            newChild = newChildren[i];

            if (!oldChild) {
                if (config.callbacks.beforeNodeAdded(newChild)) {
                    oldNode.appendChild(newChild.cloneNode(true));
                    if (config.callbacks.afterNodeAdded) config.callbacks.afterNodeAdded(newChildren[i]);
                }
            } else if (isSameNode(oldChild, newChild)) {
                morphNode(oldChild, newChild, config);
            } else {
                // Positional mismatch or new element.
                // Simple reconciliation for this ZeroCMS build: replace.
                if (config.callbacks.beforeNodeMorphed(oldChild, newChild)) {
                    oldChild.replaceWith(newChild.cloneNode(true));
                }
            }
            i++;
        }

        while (oldChildren.length > newChildren.length) {
            var toRemove = oldChildren[newChildren.length];
            if (config.callbacks.beforeNodeRemoved(toRemove)) {
                toRemove.remove();
                if (config.callbacks.afterNodeRemoved) config.callbacks.afterNodeRemoved(toRemove);
            }
        }
    }

    function isSameNode(node1, node2) {
        if (node1.nodeType !== node2.nodeType) return false;
        if (node1.nodeType === 1 && node1.tagName !== node2.tagName) return false;
        if (node1.id && node1.id === node2.id) return true;
        return false; // Default to order-based matching for now
    }

    return { morph: morph };
})();

// Re-export for ESM environment
export { Idiomorph };
