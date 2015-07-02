if (!RedactorPlugins) var RedactorPlugins = {};

/**
 * Provides the smiley button and modifies the source mode to transform HTML into BBCodes.
 * 
 * @author	Alexander Ebert, Marcel Werk
 * @copyright	2001-2015 WoltLab GmbH
 * @license	GNU Lesser General Public License <http://opensource.org/licenses/lgpl-license.php>
 */
RedactorPlugins.wbbcode = function() {
	"use strict";
	
	var $skipOnSyncReplacementOnce = false;
	
	return {
		/**
		 * Initializes the RedactorPlugins.wbbcode plugin.
		 */
		init: function() {
			var $identifier = this.$textarea.wcfIdentify();
			
			this.opts.initCallback = (function() {
				window.addEventListener('unload', (function(event) {
					this.code.startSync();
					
					this.$textarea.val(this.wbbcode.convertFromHtml(this.$textarea.val()));
				}).bind(this));
				
				if ($.browser.msie) {
					this.$editor.addClass('msie');
				}
				this.$textarea[0].setAttribute('data-is-dirty', true);
				// use stored editor contents
				var $content = $.trim(this.wutil.getOption('woltlab.originalValue'));
				if ($content.length) {
					this.wutil.replaceText($content);
					
					// ensure that the caret is not within a quote tag
					this.wutil.selectionEndOfEditor();
				}
				
				delete this.opts.woltlab.originalValue;
				
				$(document).trigger('resize');
				this.wutil.saveSelection();
			}).bind(this);
			
			this.opts.pasteBeforeCallback = $.proxy(this.wbbcode._pasteBeforeCallback, this);
			this.opts.pasteCallback = $.proxy(this.wbbcode._pasteCallback, this);
			
			var $mpCleanOnSync = this.clean.onSync;
			this.clean.onSync = (function(html) {
				html = html.replace(/\u200C/g, '__wcf_zwnj__');
				html = html.replace(/\u200D/g, '__wcf_zwj__');
				
				if ($skipOnSyncReplacementOnce === true) {
					$skipOnSyncReplacementOnce = false;
				}
				else {
					html = html.replace(/<p><br([^>]+)?><\/p>/g, '<p>@@@wcf_empty_line@@@</p>');
				}
				
				html = $mpCleanOnSync.call(this, html);
				
				html = html.replace(/__wcf_zwnj__/g, '\u200C');
				return html.replace(/__wcf_zwj__/g, '\u200D');
			}).bind(this);
			
			if (this.wutil.getOption('woltlab.autosaveOnce')) {
				this.wutil.saveTextToStorage();
				delete this.opts.woltlab.autosaveOnce;
			}
			
			// we do not support table heads
			var $tableButton = this.button.get('table');
			if ($tableButton.length) {
				var $dropdown = $tableButton.data('dropdown');
				
				// remove head add/delete
				$dropdown.find('.redactor-dropdown-add_head').parent().remove();
				$dropdown.find('.redactor-dropdown-delete_head').parent().remove();
				
				// add visual divider
				$('<li class="dropdownDivider" />').insertBefore($dropdown.find('.redactor-dropdown-delete_table').parent());
				
				// toggle dropdown options
				$tableButton.click($.proxy(this.wbbcode._tableButtonClick, this));
			}
			
			// handle 'insert quote' button
			WCF.System.Event.addListener('com.woltlab.wcf.redactor', 'insertBBCode_quote_' + $identifier, $.proxy(function(data) {
				data.cancel = true;
				
				this.wbbcode._handleInsertQuote();
			}, this));
			
			// handle 'insert code' button
			WCF.System.Event.addListener('com.woltlab.wcf.redactor', 'insertBBCode_code_' + $identifier, $.proxy(function(data) {
				data.cancel = true;
				
				this.wbbcode._handleInsertCode(null, true);
			}, this));
			
			// handle keydown
			WCF.System.Event.addListener('com.woltlab.wcf.redactor', 'keydown_' + $identifier, $.proxy(this.wbbcode._keydownCallback, this));
			WCF.System.Event.addListener('com.woltlab.wcf.redactor', 'keyup_' + $identifier, $.proxy(this.wbbcode._keyupCallback, this));
			
			// disable automatic synchronization
			this.code.sync = function() { };
			
			// fix button label for source toggling
			var $tooltip = $('.redactor-toolbar-tooltip-html:not(.jsWbbcode)').addClass('jsWbbcode').text(WCF.Language.get('wcf.bbcode.button.toggleBBCode'));
			
			var $fixBR = function(editor) {
				var elements = editor[0].querySelectorAll('br:not(:empty)');
				for (var i = 0, length = elements.length; i < length; i++) {
					elements[0].innerHTML = '';
				}
			};
			
			this.code.toggle = (function() {
				if (this.opts.visual) {
					this.code.startSync();
					
					this.code.showCode();
					this.$textarea.val(this.wbbcode.convertFromHtml(this.$textarea.val()));
					
					this.button.get('html').children('i').removeClass('fa-square-o').addClass('fa-square');
					$tooltip.text(WCF.Language.get('wcf.bbcode.button.toggleHTML'));
				}
				else {
					this.$textarea.val(this.wbbcode.convertToHtml(this.$textarea.val()));
					this.code.offset = this.$textarea.val().length;
					this.code.showVisual();
					this.wbbcode.fixBlockLevelElements();
					this.wutil.selectionEndOfEditor();
					this.wbbcode.observeQuotes();
					this.wbbcode.observeCodeListings();
					
					this.button.get('html').children('i').removeClass('fa-square').addClass('fa-square-o');
					$tooltip.text(WCF.Language.get('wcf.bbcode.button.toggleBBCode'));
					this.wutil.fixDOM();
					$fixBR(this.$editor);
					
					this.wutil.saveSelection();
				}
			}).bind(this);
			
			// insert a new line if user clicked into the editor and the last children is a quote (same behavior as arrow down)
			this.wutil.setOption('clickCallback', (function(event) {
				this.wutil.saveSelection();
				
				if (event.target === this.$editor[0]) {
					if (this.$editor[0].lastElementChild && this.$editor[0].lastElementChild.tagName === 'BLOCKQUOTE') {
						this.wutil.setCaretAfter($(this.$editor[0].lastElementChild));
					}
				}
			}).bind(this));
			
			// drop ul to prevent being touched by this.clean.clearUnverifiedRemove()
			var $index = this.opts.verifiedTags.indexOf('ul');
			if ($index > -1) {
				this.opts.verifiedTags.splice($index, 1);
			}
			
			// reattach event listeners
			WCF.System.Event.addListener('com.woltlab.wcf.redactor', 'observe_load_' + $identifier, (function(data) {
				this.wbbcode.observeCodeListings();
				this.wbbcode.observeQuotes();
			}).bind(this));
			
			WCF.System.Event.addListener('com.woltlab.wcf.redactor', 'fixFormatting_' + $identifier, $.proxy(this.wbbcode.fixFormatting, this));
		},
		
		/**
		 * Toggles features within the table dropdown.
		 * 
		 * @param	object		event
		 */
		_tableButtonClick: function(event) {
			var $button = $(event.currentTarget);
			if (!$button.hasClass('dropact')) {
				return;
			}
			
			var $current = this.selection.getBlock() || this.selection.getCurrent();
			var $dropdown = $button.data('dropdown');
			
			// within table
			$dropdown.children('li').show();
			var $insertTable = $dropdown.find('> li > .redactor-dropdown-insert_table').parent();
			if ($current.tagName == 'TD') {
				$insertTable.hide();
			}
			else {
				$insertTable.nextAll().hide();
			}
		},
		
		/**
		 * Inserts a smiley, optionally trying to register a new smiley.
		 * 
		 * @param	string		smileyCode
		 * @param	string		smileyPath
		 * @param	boolean		registerSmiley
		 */
		insertSmiley: function(smileyCode, smileyPath, registerSmiley) {
			if (registerSmiley) {
				this.wbbcode.registerSmiley(smileyCode, smileyPath);
			}
			
			if (this.opts.visual) {
				var $parentBefore = null;
				if (window.getSelection().rangeCount && window.getSelection().getRangeAt(0).collapsed) {
					$parentBefore = window.getSelection().getRangeAt(0).startContainer;
					if ($parentBefore.nodeType === Node.TEXT_NODE) {
						$parentBefore = $parentBefore.parentElement;
					}
					
					if (!this.utils.isRedactorParent($parentBefore)) {
						$parentBefore = null;
					}
				}
				
				this.insert.html('<img src="' + smileyPath + '" class="smiley" alt="' + smileyCode + '" id="redactorSmiley">', false);
				
				var $smiley = document.getElementById('redactorSmiley');
				$smiley.removeAttribute('id');
				if ($parentBefore !== null) {
					var $currentParent = window.getSelection().getRangeAt(0).startContainer;
					if ($currentParent.nodeType === Node.TEXT_NODE) {
						$currentParent = $currentParent.parentElement;
					}
					
					// smiley has been inserted outside the original caret parent, move
					if ($parentBefore !== $currentParent) {
						$parentBefore.appendChild($smiley);
					}
				}
				
				var $isSpace = function(sibling) {
					if (sibling === null) return false;
					
					if ((sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === 'SPAN') || sibling.nodeType === Node.TEXT_NODE) {
						if (sibling.textContent === "\u00A0") {
							return true;
						}
					}
					
					return false;
				};
				
				// add spaces as paddings
				var $parent = $smiley.parentElement;
				if (!$isSpace($smiley.previousSibling)) {
					var $node = document.createTextNode('\u00A0');
					$parent.insertBefore($node, $smiley);
				}
				
				if (!$isSpace($smiley.nextSibling)) {
					var $node = document.createTextNode('\u00A0');
					if ($parent.lastChild === $smiley) {
						$parent.appendChild($node);
					}
					else {
						$parent.insertBefore($node, $smiley.nextSibling);
					}
				}
			}
			else {
				this.wutil.insertAtCaret(' ' + smileyCode + ' ');
			}
		},
		
		/**
		 * Registers a new smiley, returns false if the smiley code is already registered.
		 * 
		 * @param	string		smileyCode
		 * @param	string		smileyPath
		 * @return	boolean
		 */
		registerSmiley: function(smileyCode, smileyPath) {
			if (__REDACTOR_SMILIES[smileyCode]) {
				return false;
			}
			
			__REDACTOR_SMILIES[smileyCode] = smileyPath;
			
			return true;
		},
		
		/**
		 * Converts source contents from HTML into BBCode.
		 * 
		 * @param	string		message
		 */
		convertFromHtml: function(message) {
			// DEBUG ONLY
			return __REDACTOR_AMD_DEPENDENCIES.BBCodeFromHTML.convert(message);
			
			var $searchFor = [ ];
			
			WCF.System.Event.fireEvent('com.woltlab.wcf.redactor', 'beforeConvertFromHtml', { html: html });
			
			// remove data-redactor-tag="" attribute
			html = html.replace(/(<[^>]+?) data-redactor-tag="[^"]+"/g, '$1');
			
			// remove rel="" attribute
			html = html.replace(/(<[^>]+?) rel="[^"]+"/g, '$1');
			
			// remove zero-width space sometimes slipping through
			html = html.replace(/&#(8203|x200b);/g, '');
			
			// revert conversion of special characters
			html = html.replace(/&trade;/gi, '\u2122');
			html = html.replace(/&copy;/gi, '\u00a9');
			html = html.replace(/&hellip;/gi, '\u2026');
			html = html.replace(/&mdash;/gi, '\u2014');
			html = html.replace(/&dash;/gi, '\u2010');
			
			// preserve code listings
			var $cachedCodeListings = { };
			html = html.replace(/<div([^>]+?)class="codeBox[^"]+"([^>]*?)>\n*<div>[\s\S]+?<ol start="(\d+)">([\s\S]+?)<\/ol>\n*<\/div>\n*<\/div>/g, function(match, codeBoxAttributes1, codeBoxAttributes2, lineNumber, codeContent) {
				var $attributes = codeBoxAttributes1 + ' ' + codeBoxAttributes2;
				var $highlighter = '';
				var $filename = '';
				if ($attributes.match(/data-highlighter="([a-zA-Z]+)"/)) {
					$highlighter = RegExp.$1;
				}
				if ($attributes.match(/data-filename="([^"]+)"/)) {
					$filename = $.trim(RegExp.$1);
				}
				
				var $uuid = WCF.getUUID();
				$cachedCodeListings[$uuid] = {
					codeContent: codeContent.replace(/<li>/g, '').replace(/<\/li>/g, '\n').replace(/\n$/, ''),
					filename: $filename.replace(/['"]/g, ''),
					highlighter: ($highlighter === 'plain' ? '' : $highlighter),
					lineNumber: (lineNumber > 1 ? lineNumber : 0)
				};
				
				return '@@@' + $uuid + '@@@';
			});
			
			// unwrap code boxes
			for (var $uuid in $cachedCodeListings) {
				html = html.replace(new RegExp('<p><\/p>@@@' + $uuid + '@@@<p><\/p>'), '@@@' + $uuid + '@@@');
			}
			
			// handle empty paragraphs not followed by an empty one
			html = html.replace(/<p><\/p><p>(?!<br>)/g, '<p>@@@wcf_empty_line@@@</p><p>');
			
			html = html.replace(/@@@wcf_empty_line@@@/g, '\n');
			html = html.replace(/\n\n$/, '\n');
			
			
			// drop <br>, they are pointless because the editor already adds a newline after them
			html = html.replace(/<br>/g, '');
			html = html.replace(/&nbsp;/gi, " ");
			
			// [quote]
			html = html.replace(/<blockquote([^>]+)>\n?<header[^>]*?>[\s\S]*?<\/header>/gi, function(match, attributes, innerContent) {
				var $quote;
				var $author = '';
				var $link = '';
				
				if (attributes.match(/data-author="([^"]+)"/)) {
					$author = WCF.String.unescapeHTML(RegExp.$1);
				}
				
				if (attributes.match(/cite="([^"]+)"/)) {
					$link = WCF.String.unescapeHTML(RegExp.$1);
				}
				
				if ($link) {
					$quote = "[quote='" + $author + "','" + $link + "']";
				}
				else if ($author) {
					$quote = "[quote='" + $author + "']";
				}
				else {
					$quote = "[quote]";
				}
				
				return $quote;
			});
			html = html.replace(/(?:\n*)<\/blockquote>\n?/gi, '\n[/quote]\n');
			
			// smileys
			html = html.replace(/ ?<img [^>]*?alt="([^"]+?)"[^>]*?class="smiley"[^>]*?> ?/gi, ' $1 '); // firefox
			html = html.replace(/ ?<img [^>]*?class="smiley"[^>]*?alt="([^"]+?)"[^>]*?> ?/gi, ' $1 '); // chrome, ie
			
			// attachments
			html = html.replace(/<img([^>]*?)class="[^"]*redactorEmbeddedAttachment[^"]*"([^>]*?)>/gi, function(match, attributesBefore, attributesAfter) {
				var $attributes = attributesBefore + ' ' + attributesAfter;
				var $attachmentID;
				if ($attributes.match(/data-attachment-id="(\d+)"/)) {
					$attachmentID = RegExp.$1;
				}
				else {
					return match;
				}
				
				var $float = 'none';
				var $width = null;
				
				if ($attributes.match(/style="([^"]+)"/)) {
					var $styles = RegExp.$1.split(';');
					
					for (var $i = 0; $i < $styles.length; $i++) {
						var $style = $.trim($styles[$i]);
						if ($style.match(/^float: (left|right)$/)) {
							$float = RegExp.$1;
						}
						else if ($style.match(/^width: (\d+)px$/)) {
							$width = RegExp.$1;
						}
					}
					
					if ($width !== null) {
						return '[attach=' + $attachmentID + ',' + $float + ',' + $width + '][/attach]';
					}
					else if ($float !== 'none') {
						return '[attach=' + $attachmentID + ',' + $float + '][/attach]';
					}
				}
				
				return '[attach=' + $attachmentID + '][/attach]';
			});
			
			// [img]
			html = html.replace(/<img([^>]*)?src=(["'])([^"']+?)\2([^>]*)?>/gi, function(match, attributesBefore, quotationMarks, source, attributesAfter) {
				var attrs = attributesBefore + " " + attributesAfter;
				var style = '';
				if (attrs.match(/style="([^"]+)"/)) {
					style = RegExp.$1;
				}
				
				var $float = 'none';
				var $width = 0;
				
				var $styles = style.split(';');
				for (var $i = 0; $i < $styles.length; $i++) {
					var $style = $styles[$i];
					if ($style.match(/float: (left|right|none)/)) {
						$float = RegExp.$1;
					}
					else if ($style.match(/width: (\d+)px/)) {
						$width = parseInt(RegExp.$1);
					}
				}
				
				if ($width) {
					return "[img='" + source + "'," + $float + "," + $width + "][/img]";
				}
				else if ($float !== 'none') {
					return "[img='" + source + "'," + $float + "][/img]";
				}
				
				return "[img]" + source + "[/img]";
			});
			
			// [td]+[align]
			html = html.replace(/<td style="text-align: ?(left|center|right|justify);? ?">([\s\S]*?)<\/td>/gi, "[td][align=$1]$2[/align][/td]");
			
			// cache redactor's selection markers
			var $cachedMarkers = { };
			html.replace(/<span id="selection-marker-\d+" class="redactor-selection-marker"><\/span>/, function(match) {
				var $key = match.hashCode();
				$cachedMarkers[$key] = match.replace(/\$/g, '$$$$');
				return '@@' + $key + '@@';
			});
			
			WCF.System.Event.fireEvent('com.woltlab.wcf.redactor', 'convertFromHtml', { html: html });
			
			// Remove remaining tags.
			html = html.replace(/<[^(<|>)]+>/g, '');
			
			// insert redactor's selection markers
			if ($.getLength($cachedMarkers)) {
				for (var $key in $cachedMarkers) {
					var $regex = new RegExp('@@' + $key + '@@', 'g');
					data = data.replace($regex, $cachedMarkers[$key]);
				}
			}
			
			// restore code listings
			if ($.getLength($cachedCodeListings)) {
				$.each($cachedCodeListings, function(uuid, listing) {
					var $count = 0;
					if (listing.highlighter) $count++;
					if (listing.lineNumber) $count++;
					if (listing.filename) $count++;
					
					var $attributes = '';
					switch ($count) {
						case 1:
							if (listing.highlighter) {
								$attributes = listing.highlighter;
							}
							else if (listing.filename) {
								$attributes = "'" + listing.filename + "'";
							}
							else {
								$attributes = listing.lineNumber;
							}
						break;
						
						case 2:
							if (listing.lineNumber) {
								$attributes = listing.lineNumber;
							}
							
							if (listing.highlighter) {
								if ($attributes.length) $attributes += ',';
								$attributes += listing.highlighter;
							}
							
							if (listing.filename) {
								if ($attributes.length) $attributes += ',';
								
								$attributes += "'" + listing.filename + "'";
							}
						break;
						
						case 3:
							$attributes = listing.highlighter + ',' + listing.lineNumber + ",'" + listing.filename + "'";
						break;
					}
					
					var $bbcode = '[code' + ($attributes.length ? '=' + $attributes : '') + ']' + listing.codeContent + '[/code]\n';
					
					html = html.replace(new RegExp('@@@' + uuid + '@@@\n?', 'g'), $bbcode);
				});
			}
			
			// Restore <, > and &
			html = html.replace(/&lt;/g, '<');
			html = html.replace(/&gt;/g, '>');
			html = html.replace(/&amp;/g, '&');
			
			// Restore ( and )
			html = html.replace(/%28/g, '(');
			html = html.replace(/%29/g, ')');
			
			WCF.System.Event.fireEvent('com.woltlab.wcf.redactor', 'afterConvertFromHtml', { html: html });
			
			// remove all leading and trailing whitespaces, but add one empty line at the end
			html = $.trim(html);
			if (html.length) {
				html += "\n";
			}
			
			return html;
		},
		
		/**
		 * Converts source contents from BBCode to HTML.
		 * 
		 * @param	string		message
		 */
		convertToHtml: function(message) {
			// DEBUG ONLY
			return __REDACTOR_AMD_DEPENDENCIES.BBCodeToHTML.convert(message);
			
			WCF.System.Event.fireEvent('com.woltlab.wcf.redactor', 'beforeConvertToHtml', { data: data });
			
			// remove 0x200B (unicode zero width space)
			data = this.wutil.removeZeroWidthSpace(data);
			
			// cache source code tags
			var $cachedCodes = [ ];
			var $regExp = new RegExp('\\[(' + __REDACTOR_SOURCE_BBCODES.join('|') + ')([\\S\\s]+?)\\[\\/\\1\\]', 'gi');
			data = data.replace($regExp, function(match) {
				var $key = match.hashCode();
				$cachedCodes.push({ key: $key, value: match.replace(/\$/g, '$$$$') });
				return '@@' + $key + '@@';
			});
			
			// [email]
			data = data.replace(/\[email\]([^"]+?)\[\/email]/gi, '<a href="mailto:$1">$1</a>' + this.opts.invisibleSpace);
			data = data.replace(/\[email\=([^"\]]+)](.+?)\[\/email]/gi, '<a href="mailto:$1">$2</a>' + this.opts.invisibleSpace);
			
			// [img]
			data = data.replace(/\[img\]([^"]+?)\[\/img\]/gi,'<img src="$1" />');
			data = data.replace(/\[img='?([^"]*?)'?,'?(left|right)'?\]\[\/img\]/gi, function(match, src, alignment) {
				var $style = 'float: ' + alignment + ';';
				if (alignment === 'left') {
					$style += 'margin: 0 15px 7px 0';
				}
				else {
					$style += 'margin: 0 0 7px 15px';
				}
				
				return '<img src="' + src + '" style="' + $style + '" />';
			});
			data = data.replace(/\[img='?([^"]*?)'?,'?(left|right|none)'?,'?(\d+)'?\]\[\/img\]/gi, function(match, src, alignment, width) {
				var $style = 'float: ' + alignment + '; width: ' + width + 'px;';
				if (alignment === 'left') {
					$style += 'margin: 0 15px 7px 0';
				}
				else {
					$style += 'margin: 0 0 7px 15px';
				}
				
				return '<img src="' + src + '" style="' + $style + '" />';
			});
			data = data.replace(/\[img='?([^"]*?)'?\]\[\/img\]/gi,'<img src="$1" />');
			
			// attachments
			var $attachmentUrl = this.wutil.getOption('woltlab.attachmentUrl');
			var $attachmentThumbnailUrl = this.wutil.getOption('woltlab.attachmentThumbnailUrl');
			if ($attachmentUrl) {
				var $imageAttachments = this.wbbcode._getImageAttachments();
				
				data = data.replace(/\[attach=(\d+)\]\[\/attach\]/g, function(match, attachmentID, alignment) {
					attachmentID = parseInt(attachmentID);
					
					if ($imageAttachments[attachmentID] !== undefined) {
						return '<img src="' + $attachmentThumbnailUrl.replace(/987654321/, attachmentID) + '" class="redactorEmbeddedAttachment redactorDisableResize" data-attachment-id="' + attachmentID + '" />';
					}
					
					return match;
				});
				
				data = data.replace(/\[attach=(\d+),(left|right|none)\]\[\/attach\]/g, function(match, attachmentID, alignment) {
					attachmentID = parseInt(attachmentID);
					
					if ($imageAttachments[attachmentID] !== undefined) {
						var $style = '';
						if (alignment === 'left' || alignment === 'right') {
							$style = 'float: ' + alignment + ';';
							
							if (alignment === 'left') {
								$style += 'margin: 0 15px 7px 0';
							}
							else {
								$style += 'margin: 0 0 7px 15px';
							}
						}
						
						$style = ' style="' + $style + '"';
						
						return '<img src="' + $attachmentThumbnailUrl.replace(/987654321/, attachmentID) + '" class="redactorEmbeddedAttachment redactorDisableResize" data-attachment-id="' + attachmentID + '"' + $style + ' />';
					}
					
					return match;
				});
				
				data = data.replace(/\[attach=(\d+),(left|right|none),(\d+)\]\[\/attach\]/g, function(match, attachmentID, alignment, width) {
					attachmentID = parseInt(attachmentID);
					
					if ($imageAttachments[attachmentID] !== undefined) {
						var $style = 'width: ' + width + 'px; max-height: ' + $imageAttachments[attachmentID].height + 'px; max-width: ' + $imageAttachments[attachmentID].width + 'px;';
						if (alignment === 'left' || alignment === 'right') {
							$style += 'float: ' + alignment + ';';
							
							if (alignment === 'left') {
								$style += 'margin: 0 15px 7px 0';
							}
							else {
								$style += 'margin: 0 0 7px 15px';
							}
						}
						
						$style = ' style="' + $style + '"';
						
						return '<img src="' + $attachmentUrl.replace(/987654321/, attachmentID) + '" class="redactorEmbeddedAttachment" data-attachment-id="' + attachmentID + '"' + $style + ' />';
					}
					
					return match;
				});
			}
			
			// smileys
			for (var smileyCode in __REDACTOR_SMILIES) {
				var $smileyCode = smileyCode.replace(/</g, '&lt;').replace(/>/g, '&gt;');
				var regExp = new RegExp('(\\s|>|^)' + WCF.String.escapeRegExp($smileyCode) + '(?=\\s|<|$)', 'gi');
				data = data.replace(regExp, '$1<img src="' + __REDACTOR_SMILIES[smileyCode] + '" class="smiley" alt="' + $smileyCode + '" />');
			}
			
			// remove "javascript:"
			data = data.replace(/(javascript):/gi, '$1<span></span>:');
			
			// extract [quote] bbcodes to prevent line break handling below
			var $cachedQuotes = [ ];
			var $knownQuotes = [ ];
			
			var $parts = data.split(/(\[(?:\/quote|quote|quote='[^']*?'(?:,'[^']*?')?|quote="[^"]*?"(?:,"[^"]*?")?)\])/i);
			var $lostQuote = WCF.getUUID();
			while (true) {
				var $foundClosingTag = false;
				for (var $i = 0; $i < $parts.length; $i++) {
					var $part = $parts[$i];
					if ($part.toLowerCase() === '[/quote]') {
						$foundClosingTag = true;
						
						var $content = '';
						var $previous = $parts.slice(0, $i);
						var $foundOpenTag = false;
						while ($previous.length) {
							var $prev = $previous.pop();
							$content = $prev + $content;
							if ($prev.match(/^\[quote/i)) {
								$part = $content + $part;
								
								var $key = WCF.getUUID();
								$cachedQuotes.push({
									hashCode: $key,
									content: $part.replace(/\$/g, '$$$$')
								});
								$knownQuotes.push($key);
								
								$part = '@@' + $key + '@@';
								$foundOpenTag = true;
								break;
							}
						}
						
						if (!$foundOpenTag) {
							$previous = $parts.slice(0, $i);
							$part = $lostQuote;
						}
						
						// rebuild the array
						$parts = $previous.concat($part, $parts.slice($i + 1));
						
						break;
					}
				}
				
				if (!$foundClosingTag) {
					break;
				}
			}
			
			data = $parts.join('');
			
			// restore unmatched closing quote tags
			data = data.replace(new RegExp($lostQuote, 'g'), '[/quote]');
			
			// drop trailing line breaks
			data = data.replace(/\n*$/, '');
			
			// insert quotes
			if ($cachedQuotes.length) {
				// [quote]
				var $unquoteString = function(quotedString) {
					return quotedString.replace(/^['"]/, '').replace(/['"]$/, '');
				};
				
				var self = this;
				var $transformQuote = function(quote) {
					return quote.replace(/\[quote(=(['"]).+?\2)?\]([\S\s]*)\[\/quote\]/gi, function(match, attributes, quotationMark, innerContent) {
						var $author = '';
						var $link = '';
						
						if (attributes) {
							attributes = attributes.substr(1);
							attributes = attributes.split(',');
							
							switch (attributes.length) {
								case 1:
									$author = attributes[0];
								break;
								
								case 2:
									$author = attributes[0];
									$link = attributes[1];
								break;
							}
							
							$author = WCF.String.escapeHTML($unquoteString($.trim($author)));
							$link = WCF.String.escapeHTML($unquoteString($.trim($link)));
						}
						
						var $quote = '<blockquote class="quoteBox container containerPadding quoteBoxSimple" cite="' + $link + '" data-author="' + $author + '">'
								+ '<header contenteditable="false">'
									+ '<h3>'
										+ self.wbbcode._buildQuoteHeader($author, $link)
									+ '</h3>'
									+ '<a class="redactorQuoteEdit"></a>'
								+ '</header>';
						
						innerContent = $.trim(innerContent);
						var $tmp = '';
						
						if (innerContent.length) {
							var $lines = innerContent.split('\n');
							for (var $i = 0; $i < $lines.length; $i++) {
								var $line = $lines[$i];
								if ($line.length === 0) {
									$line = self.opts.invisibleSpace;
								}
								else if ($line.match(/^@@([0-9\-]+)@@$/)) {
									if (WCF.inArray(RegExp.$1, $knownQuotes)) {
										// prevent quote being nested inside a <div> block
										$tmp += $line;
										continue;
									}
								}
								
								$tmp += '<div>' + $line + '</div>';
							}
						}
						else {
							$tmp = '<div>' + self.opts.invisibleSpace + '</div>';
						}
						
						$quote += $tmp;
						$quote += '</blockquote>';
						
						return $quote;
					});
				};
				
				// reinsert quotes in reverse order, adding the most outer quotes first
				for (var $i = $cachedQuotes.length - 1; $i >= 0; $i--) {
					var $cachedQuote = $cachedQuotes[$i];
					var $regex = new RegExp('@@' + $cachedQuote.hashCode + '@@', 'g');
					data = data.replace($regex, $transformQuote($cachedQuote.content));
				}
			}
			
			// insert codes
			if ($cachedCodes.length) {
				for (var $i = $cachedCodes.length - 1; $i >= 0; $i--) {
					var $cachedCode = $cachedCodes[$i];
					var $regex = new RegExp('@@' + $cachedCode.key + '@@', 'g');
					var $value = $cachedCode.value;
					
					// [tt]
					$value = $value.replace(/^\[tt\]([\s\S]+)\[\/tt\]/, (function(match, content) {
						var $tmp = content.split("\n");
						content = '';
						
						for (var $i = 0, $length = $tmp.length; $i < $length; $i++) {
							var $line = $tmp[$i];
							
							if ($line.length) {
								if (content.length) content += '</p><p>';
								
								content += '[tt]' + $line + '[/tt]';
							}
							else {
								if ($i === 0 || ($i + 1) === $length) {
									// ignore the first and last empty element
									continue;
								}
								
								if (content.match(/\[\/tt\]$/)) {
									content += '</p><p>' + this.opts.invisibleSpace + '';
								}
								else {
									content += '</p><p><br>';
								}
							}
						}
						
						return content;
					}).bind(this));
					
					// [code]
					$value = $value.replace(/^\[code([^\]]*)\]([\S\s]*)\[\/code\]$/, (function(matches, parameters, content) {
						var $highlighter = 'plain';
						var $lineNumber = 0;
						var $filename = '';
						
						if (parameters) {
							parameters = parameters.substring(1);
							parameters = parameters.split(',');
							
							var $isNumber = function(string) { return string.match(/^\d+$/); };
							var $isFilename = function(string) { return (string.indexOf('.') !== -1) || (string.match(/^(["']).*\1$/)); };
							var $isHighlighter = function(string) { return  (__REDACTOR_CODE_HIGHLIGHTERS[string] !== undefined); };
							
							var $unquoteFilename = function(filename) {
								return filename.replace(/^(["'])(.*)\1$/, '$2');
							};
							
							switch (parameters.length) {
								case 1:
									if ($isNumber(parameters[0])) {
										$lineNumber = (parseInt(parameters[0]) > 1) ? parameters[0] : 0;
									}
									else if ($isFilename(parameters[0])) {
										$filename = $unquoteFilename(parameters[0]);
									}
									else if ($isHighlighter(parameters[0])) {
										$highlighter = parameters[0];
									}
								break;
								
								case 2:
									if ($isNumber(parameters[0])) {
										$lineNumber = (parseInt(parameters[0]) > 1) ? parameters[0] : 0;
										
										if ($isHighlighter(parameters[1])) {
											$highlighter = parameters[1];
										}
										else if ($isFilename(parameters[1])) {
											$filename = $unquoteFilename(parameters[1]);
										}
									}
									else {
										if ($isHighlighter(parameters[0])) $highlighter = parameters[0];
										if ($isFilename(parameters[1])) $filename = $unquoteFilename(parameters[1]);
									}
								break;
								
								case 3:
									if ($isHighlighter(parameters[0])) $highlighter = parameters[0];
									if ($isNumber(parameters[1])) $lineNumber = parameters[1];
									if ($isFilename(parameters[2])) $filename = $unquoteFilename(parameters[2]);
								break;
							}
						}
						
						content = content.replace(/^\n+/, '').replace(/\n+$/, '').split(/\n/);
						var $lines = '';
						for (var $i = 0; $i < content.length; $i++) {
							var $line = content[$i];
							if (!$line.length) {
								$line = this.opts.invisibleSpace;
							}
							
							$lines += '<li>' + $line + '</li>';
						}
						
						return '<div class="codeBox container" contenteditable="false" data-highlighter="' + $highlighter + '"' + ($filename ? ' data-filename="' + WCF.String.escapeHTML($filename) + '"' : '' ) + '>'
							+ '<div>'
								+ '<div>'
									+ '<h3>' + __REDACTOR_CODE_HIGHLIGHTERS[$highlighter] + ($filename ? ': ' + WCF.String.escapeHTML($filename) : '') + '</h3>'
								+ '</div>'
								+ '<ol start="' + ($lineNumber > 1 ? $lineNumber : 1) + '">'
									+ $lines
								+ '</ol>'
							+ '</div>'
						+ '</div>';
					}).bind(this));
					
					data = data.replace($regex, $value);
				}
			}
			
			WCF.System.Event.fireEvent('com.woltlab.wcf.redactor', 'afterConvertToHtml', { data: data });
			
			return data;
		},
		
		/**
		 * Converts certain HTML elements prior to paste in order to preserve formattings.
		 * 
		 * @param	string		html
		 * @return	string
		 */
		_pasteBeforeCallback: function(html) {
			var $levels = {
				1: 24,
				2: 22,
				3: 18,
				4: 14,
				5: 12,
				6: 10
			};
			
			// replace <h1> ... </h6> tags
			html = html.replace(/<h([1-6])([^>]*)>/g, function(match, level, elementAttributes) {
				if (elementAttributes && elementAttributes.match(/style="([^"]+?)"/)) {
					if (/font-size: ?(\d+|\d+\.\d+)(px|pt|em|rem|%)/.test(RegExp.$1)) {
						var $div = $('<div style="width: ' + RegExp.$1 + RegExp.$2 + '; position: absolute;" />').appendTo(document.body);
						var $width = parseInt($div[0].clientWidth);
						$div.remove();
						
						// look for the closest matching size
						var $bestMatch = -1;
						var $isExactMatch = false;
						$.each($levels, function(k, v) {
							if ($bestMatch === -1) {
								$bestMatch = k;
							}
							else {
								if (Math.abs($width - v) < Math.abs($width - $levels[$bestMatch])) {
									$bestMatch = k;
								}
							}
							
							if ($width == v) {
								$isExactMatch = true;
							}
						});
						
						if (!$isExactMatch) {
							// if dealing with non-exact matches, lower size by one level
							$bestMatch = ($bestMatch < 6) ? parseInt($bestMatch) + 1 : $bestMatch;
						}
						
						level = $bestMatch;
					}
				}
				
				return '[size=' + $levels[level] + ']';
			});
			html = html.replace(/<\/h[1-6]>/g, '[/size]');
			
			// convert block-level elements
			html = html.replace(/<(article|header)[^>]+>/g, '<div>');
			html = html.replace(/<\/(article|header)>/g, '</div>');
			
			// replace nested elements e.g. <div><p>...</p></div>
			html = html.replace(/<(div|p)([^>]+)?><(div|p)([^>]+)?>/g, '<p>');
			html = html.replace(/<\/(div|p)><\/(div|p)>/g, '</p>');
			//html = html.replace(/<(div|p)><br><\/(div|p)>/g, '<p>');
			
			// strip classes from certain elements
			html = html.replace(/<(?:div|p|span)[^>]+>/gi, function(match) {
				return match.replace(/ class="[^"]+"/, '');
			});
			
			// drop <wbr>
			html = html.replace(/<\/?wbr[^>]*>/g, '');
			
			WCF.System.Event.fireEvent('com.woltlab.wcf.redactor', 'beforePaste', { html: html });
			
			return html;
		},
		
		/**
		 * Restores and fixes formatting before inserting pasted HTML into the editor.
		 * 
		 * @param	string		html
		 * @return	string
		 */
		_pasteCallback: function(html) {
			/*var $uuid = WCF.getUUID();
			
			// replace <p>...</p> with <p>...</p><p><br></p> unless there is already a newline
			html = html.replace(/<p>([\s\S]*?)<\/p>/gi, function(match, content) {
				if (content.match(/^<br( \/)?>$/)) {
					return match;
				}
				
				return match + '@@@' + $uuid + '@@@';
			});
			html = html.replace(new RegExp('@@@' + $uuid + '@@@(<p><br(?: /)?></p>)?', 'g'), function(match, next) {
				if (next) {
					return next;
				}
				
				return '<p><br></p>';
			});*/
			
			// restore font size
			html = html.replace(/\[size=(\d+)\]/g, '<p><span style="font-size: $1pt">');
			html = html.replace(/\[\/size\]/g, '</span></p>');
			
			// strip background-color
			html = html.replace(/style="([^"]+)"/, function(match, inlineStyles) {
				var $parts = inlineStyles.split(';');
				var $styles = [ ];
				for (var $i = 0, $length = $parts.length; $i < $length; $i++) {
					var $part = $parts[$i];
					if (!$part.match(/^\s*background-color/)) {
						$styles.push($part);
					}
				}
				
				return 'style="' + $styles.join(';') + '"';
			});
			
			WCF.System.Event.fireEvent('com.woltlab.wcf.redactor', 'afterPaste', { html: html });
			
			return html;
			
			// TODO
			
			// handle pasting of images in Firefox
			html = html.replace(/<img([^>]+)>/g, function(match, content) {
				match = match.replace(/data-mozilla-paste-image="0"/, 'data-mozilla-paste-image="0" style="display:none"');
				return match;
			});
			
			
			
			return html;
		},
		
		/**
		 * Inserts an attachment with live preview.
		 * 
		 * @param	integer		attachmentID
		 * @param	boolean		insertFull
		 */
		insertAttachment: function(attachmentID, insertFull) {
			attachmentID = parseInt(attachmentID);
			var $attachmentUrl = this.wutil.getOption('woltlab.attachment' + (!insertFull ? 'Thumbnail' : '') + 'Url');
			var $imageAttachments = this.wbbcode._getImageAttachments();
			
			if ($attachmentUrl && $imageAttachments[attachmentID] !== undefined) {
				var $style = '';
				if (insertFull) {
					$style = ' style="width: ' + $imageAttachments[attachmentID].width + 'px; max-height: ' + $imageAttachments[attachmentID].height + 'px; max-width: ' + $imageAttachments[attachmentID].width + 'px;"';
				}
				
				this.wutil.insertDynamic(
					'<img src="' + $attachmentUrl.replace(/987654321/, attachmentID) + '" class="redactorEmbeddedAttachment' + (!insertFull ? ' redactorDisableResize' : '') + '" data-attachment-id="' + attachmentID + '"' + $style + ' />',
					'[attach=' + attachmentID + (insertFull ? ',none,' + $imageAttachments[attachmentID].width : '') + '][/attach]'
				);
			}
			else {
				this.wutil.insertDynamic('[attach=' + attachmentID + '][/attach]');
			}
		},
		
		/**
		 * Removes an attachment from WYSIWYG view.
		 * 
		 * @param	integer		attachmentID
		 */
		removeAttachment: function(attachmentID) {
			if (!this.opts.visual) {
				// we're not going to mess with the code view
				return;
			}
			
			this.$editor.find('img.redactorEmbeddedAttachment').each(function(index, attachment) {
				var $attachment = $(attachment);
				if ($attachment.data('attachmentID') == attachmentID) {
					$attachment.remove();
				}
			});
		},
		
		/**
		 * Returns a list of attachments representing an image.
		 * 
		 * @return	object
		 */
		_getImageAttachments: function() {
			// WCF.Attachment.Upload may have no been initialized yet, fallback to static data
			var $imageAttachments = this.wutil.getOption('woltlab.attachmentImages') || [ ];
			if ($imageAttachments.length) {
				delete this.opts.attachmentImages;
				
				return $imageAttachments;
			}
			
			var $data = {
				imageAttachments: { }
			};
			WCF.System.Event.fireEvent('com.woltlab.wcf.redactor', 'getImageAttachments_' + this.$textarea.wcfIdentify(), $data);
			
			return $data.imageAttachments;
		},
		
		/**
		 * Handles up/down/delete/backspace key for quote boxes.
		 * 
		 * @param	object		data
		 */
		_keydownCallback: function(data) {
			switch (data.event.which) {
				case $.ui.keyCode.BACKSPACE:
				case $.ui.keyCode.DELETE:
				case $.ui.keyCode.DOWN:
				case $.ui.keyCode.ENTER:
				case $.ui.keyCode.UP:
				case 83: // [S]
					// handle keys
				break;
				
				default:
					return;
				break;
			}
			
			this.selection.get();
			var current = this.selection.getCurrent();
			var $parent = this.selection.getParent();
			$parent = ($parent) ? $($parent) : $parent;
			var $quote = ($parent) ? $parent.closest('blockquote.quoteBox', this.$editor.get()[0]) : { length: 0 };
			
			switch (data.event.which) {
				// backspace key
				case $.ui.keyCode.BACKSPACE:
					if (this.wutil.isCaret()) {
						var $preventAndSelectQuote = false;
						
						if ($quote.length) {
							// check if quote is empty
							var $isEmpty = true;
							for (var $i = 0; $i < $quote[0].children.length; $i++) {
								var $child = $quote[0].children[$i];
								if ($child.tagName === 'DIV') {
									if ($child.textContent.replace(/\u200b/, '').length) {
										$isEmpty = false;
										break;
									}
								}
							}
							
							if ($isEmpty) {
								$preventAndSelectQuote = true;
							}
							else {
								// check if caret is at the start of the quote
								var range = (this.selection.implicitRange === null) ? this.range : this.selection.implicitRange;
								if (range.startOffset === 0) {
									var element = range.startContainer, prev;
									while ((element = element.parentNode) !== null) {
										prev = element.previousSibling;
										if (prev !== null) {
											if (prev.nodeType === Node.ELEMENT_NODE && prev.nodeName === 'HEADER') {
												$preventAndSelectQuote = true;
											}
											
											break;
										}
									}
								}								
							}
						}
						else {
							var $range = (this.selection.implicitRange === null) ? this.range : this.selection.implicitRange;
							var $scope = $range.startContainer;
							if ($scope.nodeType === Node.TEXT_NODE) {
								if ($range.startOffset === 0 || ($range.startOffset === 1 && $scope.textContent === '\u200b')) {
									if (!$scope.previousSibling) {
										$scope = $scope.parentElement;
									}
								}
							}
							
							if ($scope.nodeType === Node.ELEMENT_NODE) {
								var $previous = $scope.previousSibling;
								if ($previous && $previous.nodeType === Node.ELEMENT_NODE && $previous.tagName === 'BLOCKQUOTE') {
									$quote = $previous;
									$preventAndSelectQuote = true;
								}
							}
						}
						
						if ($preventAndSelectQuote) {
							// expand selection and prevent delete
							var $selection = window.getSelection();
							if ($selection.rangeCount) $selection.removeAllRanges();
							
							var $quoteRange = document.createRange();
							$quoteRange.selectNode($quote[0] || $quote);
							$selection.addRange($quoteRange);
							
							data.cancel = true;
						}
					}
				break;
				
				// delete key
				case $.ui.keyCode.DELETE:
					if (this.wutil.isCaret() && this.wutil.isEndOfElement(current)) {
						var $next = current.nextElementSibling;
						if ($next && $next.tagName === 'BLOCKQUOTE') {
							// expand selection and prevent delete
							var $selection = window.getSelection();
							if ($selection.rangeCount) $selection.removeAllRanges();
							
							var $quoteRange = document.createRange();
							$quoteRange.selectNode($next);
							$selection.addRange($quoteRange);
							
							data.cancel = true;
						}
					}
				break;
				
				// arrow down
				case $.ui.keyCode.DOWN:
					var $current = $(current);
					if ($current.next('blockquote').length) {
						this.caret.setStart($current.next().children('div:first'));
						
						data.cancel = true;
					}
					else if ($parent) {
						if ($parent.next('blockquote').length) {
							this.caret.setStart($parent.next().children('div:first'));
							
							data.cancel = true;
						}
						else if ($quote.length) {
							var $container = $current.closest('div', $quote[0]);
							if (!$container.next().length) {
								// check if there is an element after the quote
								if ($quote.next().length) {
									this.caret.setStart($quote.next());
								}
								else {
									this.wutil.setCaretAfter($quote);
								}
								
								data.cancel = true;
							}
						} 
					}
				break;
				
				// enter
				case $.ui.keyCode.ENTER:
					if ($quote.length) {
						// prevent Redactor's default behavior for <blockquote>
						this.keydown.blockquote = false;
						this.keydown.enterWithinBlockquote = true;
					}
				break;
				
				// arrow up
				case $.ui.keyCode.UP:
					if (!$parent || !$quote.length) {
						return;
					}
					
					var $container = $(current).closest('div', $quote[0]);
					var $prev = $container.prev();
					if ($prev[0].tagName === 'DIV') {
						return;
					}
					else if ($prev[0].tagName === 'BLOCKQUOTE') {
						return;
					}
					
					var $previousElement = $quote.prev();
					if ($previousElement.length === 0) {
						this.wutil.setCaretBefore($quote);
					}
					else {
						if ($previousElement[0].tagName === 'BLOCKQUOTE') {
							// set focus to quote text rather than the element itself
							this.caret.sendEnd($previousElement.children('div:last'));
						}
						else {
							// focus is wrong if the previous element is empty (e.g. only a newline present)
							if ($.trim($previousElement.html()) == '') {
								$previousElement.html(this.opts.invisibleSpace);
							}
							
							this.caret.setEnd($previousElement);
						}
					}
					
					data.cancel = true;
				break;
				
				// [S]
				case 83:
					// not supported on mobile devices anyway
					if ($.browser.mobile) {
						return;
					}
					
					var $submitEditor = false;
					if (navigator.platform.match(/^Mac/)) {
						if (data.event.ctrlKey && data.event.altKey) {
							$submitEditor = true;
						}
					}
					else if (data.event.altKey && !data.event.ctrlKey) {
						$submitEditor = true;
					}
					
					if ($submitEditor) {
						var $data = { cancel: false };
						WCF.System.Event.fireEvent('com.woltlab.wcf.redactor', 'submitEditor_' + this.$textarea.wcfIdentify(), $data);
						
						if ($data.cancel) {
							data.cancel = true;
						}
					}
				break;
			}
		},
		
		/**
		 * Handles quote deletion.
		 * 
		 * @param	object		data
		 */
		_keyupCallback: function(data) {
			switch (data.event.which) {
				case $.ui.keyCode.BACKSPACE:
				case $.ui.keyCode.DELETE:
					// check for empty <blockquote>
					this.$editor.find('blockquote').each(function(index, blockquote) {
						var $blockquote = $(blockquote);
						if (!$blockquote.children('header').length) {
							$blockquote.remove();
						}
					});
				break;
				
				case $.ui.keyCode.ENTER:
					// fix markup for empty lines
					for (var $i = 0, $length = this.$editor[0].children.length; $i < $length; $i++) {
						var $child = this.$editor[0].children[$i];
						if ($child.nodeType !== Node.ELEMENT_NODE || $child.tagName !== 'P') {
							// not a <p> element
							continue;
						}
						
						if ($child.textContent.length > 0) {
							// element is non-empty
							continue;
						}
						
						if ($child.children.length > 1 || $child.children[0].tagName === 'BR') {
							// element contains more than one children or it is just a <br>
							continue;
						}
						
						// head all the way down to the most inner node
						$child = $child.children[0];
						while ($child.children.length === 1) {
							$child = $child.children[0];
						}
						
						// check if node has no children and it is a <br>
						if ($child.children.length === 0 && $child.tagName === 'BR') {
							var $parent = $child.parentNode;
							var $node = document.createTextNode('\u200b');
							$parent.appendChild($node);
							$parent.removeChild($child);
						}
					}
				break;
			}
		},
		
		/**
		 * Initializes source editing for quotes.
		 */
		observeQuotes: function() {
			this.$editor.find('.redactorQuoteEdit').off('click.wbbcode').on('click.wbbcode', $.proxy(this.wbbcode._observeQuotesClick, this));
		},
		
		/**
		 * Handles clicks on the 'edit quote' link.
		 * 
		 * @param	object		event
		 */
		_observeQuotesClick: function(event) {
			var $header = $(event.currentTarget).closest('header');
			var $tooltip = $('<span class="redactor-link-tooltip" />');
			
			$('<a href="#">' + WCF.Language.get('wcf.bbcode.quote.edit') + '</a>').click($.proxy(function(e) {
				e.preventDefault();
				
				this.wbbcode._openQuoteEditOverlay($(event.currentTarget).closest('blockquote.quoteBox'), false);
				$('.redactor-link-tooltip').remove();
			}, this)).appendTo($tooltip);
			
			var $offset = $header.offset();
			$tooltip.css({
				left: $offset.left + 'px',
				top: ($offset.top + 20) + 'px'
			});
			
			$('.redactor-link-tooltip').remove();
			$tooltip.appendTo(document.body);
			
			// prevent the cursor being placed in the quote header
			this.selection.remove();
		},
		
		/**
		 * Initializes editing for code listings.
		 */
		observeCodeListings: function() {
			this.$editor.find('.codeBox').each((function(index, codeBox) {
				var $codeBox = $(codeBox);
				var $editBox = $codeBox.find('.redactorEditCodeBox');
				if (!$editBox.length) {
					$editBox = $('<div class="redactorEditCodeBox"><div>' + WCF.Language.get('wcf.bbcode.code.edit') + '</div></div>').insertAfter($codeBox.find('> div > div > h3'));
				}
				
				$editBox.off('click.wbbcode').on('click.wbbcode', (function() {
					this.wbbcode._handleInsertCode($codeBox, false);
				}).bind(this));
			}).bind(this));
		},
		
		/**
		 * Opens the quote source edit dialog.
		 * 
		 * @param	jQuery		quote
		 * @param	boolean		insertQuote
		 */
		_openQuoteEditOverlay: function(quote, insertQuote) {
			this.modal.load('quote', WCF.Language.get('wcf.bbcode.quote.' + (insertQuote ? 'insert' : 'edit')), 400);
			
			var $button = this.modal.createActionButton(this.lang.get('save'));
			if (insertQuote) {
				this.selection.save();
				
				$button.click($.proxy(function() {
					var $author = $('#redactorQuoteAuthor').val();
					var $link = WCF.String.escapeHTML($('#redactorQuoteLink').val());
					
					this.selection.restore();
					$skipOnSyncReplacementOnce = true;
					var $html = this.selection.getHtml();
					if (this.utils.isEmpty($html)) {
						$html = '';
					}
					
					var $quote = this.wbbcode.insertQuoteBBCode($author, $link, $html);
					if ($quote !== null) {
						// set caret inside the quote
						if (!$html.length) {
							// careful, Firefox is stupid and replaces an empty div with br[type=_moz]
							if ($.browser.mozilla) {
								$quote.children('br[type=_moz]').replaceWith('<div>' + this.opts.invisibleSpace + '</div>');
							}
							
							this.caret.setStart($quote.children('div')[0]);
						}
					}
					
					this.modal.close();
				}, this));
			}
			else {
				$('#redactorQuoteAuthor').val(quote.data('author'));
				
				// do not use prop() here, an empty cite attribute would yield the page URL instead
				$('#redactorQuoteLink').val(WCF.String.unescapeHTML(quote.attr('cite')));
				
				$button.click($.proxy(function() {
					var $author = $('#redactorQuoteAuthor').val();
					quote.data('author', $author);
					quote.attr('data-author', $author);
					quote.prop('cite', WCF.String.escapeHTML($('#redactorQuoteLink').val()));
					
					this.wbbcode._updateQuoteHeader(quote);
					
					this.modal.close();
				}, this));
			}
			
			this.modal.show();
		},
		
		/**
		 * Updates the quote's source.
		 * 
		 * @param	jQuery		quote
		 */
		_updateQuoteHeader: function(quote) {
			var $author = quote.data('author');
			var $link = quote.attr('cite');
			if ($link) $link = WCF.String.escapeHTML($link);
			
			quote.find('> header > h3').empty().append(this.wbbcode._buildQuoteHeader($author, $link));	
		},
		
		/**
		 * Inserts the quote BBCode.
		 * 
		 * @param	string		author
		 * @param	string		link
		 * @param	string		html
		 * @param	string		plainText
		 * @return	jQuery
		 */
		insertQuoteBBCode: function(author, link, html, plainText) {
			var $openTag = '[quote]';
			var $closingTag = '[/quote]';
			
			if (author) {
				if (link) {
					$openTag = "[quote='" + author + "','" + link + "']";
				}
				else {
					$openTag = "[quote='" + author + "']";
				}
			}
			
			var $quote = null;
			if (this.wutil.inWysiwygMode()) {
				var $id = WCF.getUUID();
				var $html = '';
				if (plainText) {
					$html = this.wbbcode.convertToHtml($openTag + plainText + $closingTag);
				}
				else {
					$html = this.wbbcode.convertToHtml($openTag + $id + $closingTag);
					$html = $html.replace($id, html.replace(/^<p>/, '').replace(/<\/p>$/, ''));
				}
				
				$html = $html.replace(/^<p>/, '').replace(/<\/p>$/, '');
				
				// assign a unique id in order to recognize the inserted quote
				$html = $html.replace(/<blockquote/, '<blockquote id="' + $id + '"');
				
				if (!window.getSelection().rangeCount) {
					this.wutil.restoreSelection();
					
					if (!window.getSelection().rangeCount) {
						this.$editor.focus();
						
						if (!window.getSelection().rangeCount) {
							this.wutil.selectionEndOfEditor();
						}
						
						this.wutil.saveSelection();
					}
				}
				
				window.getSelection().getRangeAt(0).deleteContents();
				
				this.wutil.restoreSelection();
				var $selection = window.getSelection().getRangeAt(0);
				var $current = $selection.startContainer;
				while ($current) {
					var $parent = $current.parentNode;
					if ($parent === this.$editor[0]) {
						break;
					}
					
					$current = $parent;
				}
				
				if ($current && $current.parentNode === this.$editor[0]) {
					if ($current.innerHTML.length) {
						if ($current.innerHTML === '\u200b') {
							this.caret.setEnd($current);
						}
						else {
							this.wutil.setCaretAfter($current);
						}
					}
				}
				
				this.insert.html($html, false);
				
				$quote = this.$editor.find('#' + $id);
				if ($quote.length) {
					// quote may be empty if $innerHTML was empty, fix it
					var $inner = $quote.find('> div');
					if ($inner.length == 1) {
						if ($inner[0].innerHTML === '') {
							$inner[0].innerHTML = this.opts.invisibleSpace;
						}
					}
					else if ($.browser.mozilla) {
						// Firefox on Mac OS X sometimes removes the "empty" div and replaces it with <br type="_moz">
						var $br = $quote.find('> div > br[type=_moz]');
						if ($br.length) {
							$('<div>' + this.opts.invisibleSpace + '</div>').insertBefore($br);
							$br.remove();
						}
					}
					
					$quote.removeAttr('id');
					this.wutil.setCaretAfter($quote[0]);
					
					// inserting a quote can spawn an additional empty newline in front
					var prev = $quote[0].previousElementSibling;
					if (prev !== null && prev.nodeName === 'P' && prev.innerHTML === '\u200B') {
						prev = prev.previousElementSibling;
						if (prev !== null && prev.nodeName === 'P' && (prev.innerHTML === '\u200B' || prev.innerHTML === '<br>')) {
							prev.parentNode.removeChild(prev.nextElementSibling);
						}
					}
				}
				
				this.wbbcode.observeQuotes();
				this.wbbcode.fixBlockLevelElements();
				
				this.$toolbar.find('a.re-__wcf_quote').removeClass('redactor-button-disabled');
			}
			else {
				this.wutil.insertAtCaret($openTag + plainText + $closingTag);
			}
			
			this.wutil.saveSelection();
			
			return $quote;
		},
		
		/**
		 * Builds the quote source HTML.
		 * 
		 * @param	string		author
		 * @param	string		link
		 * @return	string
		 */
		_buildQuoteHeader: function(author, link) {
			var $header = '';
			// author is empty, check if link was provided and use it instead
			if (!author && link) {
				author = link;
				link = '';
			}
			
			if (author) {
				if (link) $header += '<a href="' + link + '" tabindex="-1">';
				
				$header += WCF.Language.get('wcf.bbcode.quote.title.javascript', { quoteAuthor: WCF.String.unescapeHTML(author) });
				
				if (link) $header += '</a>';
			}
			else {
				$header = '<small>' + WCF.Language.get('wcf.bbcode.quote.title.clickToSet') + '</small>';
			}
			
			return $header;
		},
		
		_handleInsertQuote: function() {
			this.wbbcode._openQuoteEditOverlay(null, true);
		},
		
		/**
		 * Opens the code edit dialog.
		 * 
		 * @param	jQuery		codeBox
		 * @param	boolean		isInsert
		 */
		_handleInsertCode: function(codeBox, isInsert) {
			this.modal.load('code', WCF.Language.get('wcf.bbcode.code.' + (isInsert ? 'insert' : 'edit')), 400);
			
			var $button = this.modal.createActionButton(this.lang.get('save')).addClass('buttonPrimary');
			
			if (isInsert) {
				this.selection.get();
				var $selectedText = this.selection.getText();
				
				this.selection.save();
				this.modal.show();
				
				var $codeBox = $('#redactorCodeBox').focus();
				$codeBox.val($selectedText);
				
				$button.click($.proxy(function() {
					var $codeBox = $('#redactorCodeBox');
					var $filename = $('#redactorCodeFilename');
					var $highlighter = $('#redactorCodeHighlighter');
					var $lineNumber = $('#redactorCodeLineNumber');
					
					var $codeBoxContent = $codeBox.val().replace(/^\n+/, '').replace(/\n+$/, '');
					if ($.trim($codeBoxContent).length === 0) {
						if (!$codeBox.next('small.innerError').length) {
							$('<small class="innerError">' + WCF.Language.get('wcf.global.form.error.empty') + '</small>').insertAfter($codeBox);
						}
						
						return;
					}
					
					var $codeFilename = $.trim($filename.val().replace(/['"]/g, ''));
					var $bbcode = '[code=' + $highlighter.val() + ',' + $lineNumber.val() + ($codeFilename.length ? ",'" + $codeFilename + "'" : '') + ']';
					if ($bbcode.match(/\[code=([^,]+),(\d+)\]/)) {
						// reverse line number and highlighter
						$bbcode = '[code=' + RegExp.$2 + ',' + RegExp.$1 + ']';
					}
					
					$bbcode += $codeBoxContent;
					$bbcode += '[/code]';
					
					this.wutil.adjustSelectionForBlockElement();
					this.wutil.saveSelection();
					var $html = this.wbbcode.convertToHtml($bbcode);
					
					this.buffer.set();
					
					this.insert.html($html, false);
					
					// set caret after code listing
					var $codeBox = this.$editor.find('.codeBox:not(.jsRedactorCodeBox)');
					
					this.wbbcode.observeCodeListings();
					this.wbbcode.fixBlockLevelElements();
					
					// document.execCommand('insertHTML') seems to drop 'contenteditable="false"' for root element
					$codeBox.attr('contenteditable', 'false');
					this.wutil.setCaretAfter($codeBox[0]);
					
					this.modal.close();
				}, this));
			}
			else {
				var $deleteButton = this.modal.createActionButton(WCF.Language.get('wcf.global.button.delete'));
				$deleteButton.click((function() {
					this.buffer.set();
					
					codeBox.remove();
					
					this.modal.close();
				}).bind(this));
				
				this.modal.show();
				
				var $codeBox = $('#redactorCodeBox').focus();
				var $filename = $('#redactorCodeFilename');
				var $highlighter = $('#redactorCodeHighlighter');
				var $lineNumber = $('#redactorCodeLineNumber');
				
				$highlighter.val(codeBox.data('highlighter'));
				$filename.val(codeBox.data('filename') || '');
				var $list = codeBox.find('> div > ol');
				$lineNumber.val(parseInt($list.prop('start')));
				
				var $code = '';
				$list.children('li').each(function(index, listItem) {
					$code += $(listItem).text().replace(/^\u200b$/, '') + "\n";
				});
				$codeBox.val($code.replace(/^\n+/, '').replace(/\n+$/, ''));
				
				$button.click($.proxy(function() {
					var $codeBoxContent = $codeBox.val().replace(/^\n+/, '').replace(/\n+$/, '');
					if ($.trim($codeBoxContent).length === 0) {
						if (!$codeBox.next('small.innerError').length) {
							$('<small class="innerError">' + WCF.Language.get('wcf.global.form.error.empty') + '</small>').insertAfter($codeBox);
						}
						
						return;
					}
					
					var $selectedHighlighter = $highlighter.val();
					codeBox.data('highlighter', $selectedHighlighter);
					codeBox.attr('data-highlighter', $selectedHighlighter);
					
					var $headline = __REDACTOR_CODE_HIGHLIGHTERS[$selectedHighlighter];
					var $codeFilename = $.trim($filename.val().replace(/['"]/g, ''));
					if ($codeFilename) {
						$headline += ': ' + WCF.String.escapeHTML($codeFilename);
						codeBox.data('filename', $codeFilename);
						codeBox.attr('data-filename', $codeFilename);
					}
					else {
						codeBox.removeAttr('data-filename');
						codeBox.removeData('filename');
					}
					
					codeBox.data('highlighter', $highlighter.val());
					codeBox.find('> div > div > h3').html($headline);
					
					var $list = codeBox.find('> div > ol').empty();
					var $start = parseInt($lineNumber.val());
					$list.prop('start', ($start > 1 ? $start : 1));
					
					$codeBoxContent = $codeBoxContent.split('\n');
					var $codeContent = '';
					for (var $i = 0; $i < $codeBoxContent.length; $i++) {
						$codeContent += '<li>' + WCF.String.escapeHTML($codeBoxContent[$i]) + '</li>';
					}
					$list.append($($codeContent));
					
					this.modal.close();
				}, this));
			}
		},
		
		/**
		 * Inserting block-level elements (e.g. quotes or code bbcode) can lead to void paragraphs.
		 */
		fixBlockLevelElements: function() {
			return;
			var $removeVoidElements = (function(referenceElement, position) {
				var $sibling = referenceElement[position];
				if ($sibling && $sibling.nodeType === Node.ELEMENT_NODE && $sibling.tagName === 'P') {
					if (!$sibling.innerHTML.length) {
						$sibling.parentElement.removeChild($sibling);
					}
					/*else if ($sibling.innerHTML === '\u200b') {
						var $adjacentSibling = $sibling[position];
						if ($adjacentSibling && $adjacentSibling.nodeType === Node.ELEMENT_NODE && $adjacentSibling.tagName === 'P' && $adjacentSibling.innerHTML.length) {
							$sibling.parentElement.removeChild($sibling);
						}
					}*/
				}
			}).bind(this);
			
			this.$editor.find('blockquote, .codeBox').each(function() {
				$removeVoidElements(this, 'previousElementSibling');
				$removeVoidElements(this, 'nextElementSibling');
			});
		},
		
		/**
		 * Fixes incorrect formatting applied to element that should be left untouched.
		 * 
		 * @param	object		data
		 */
		fixFormatting: function(data) {
			var $stripTextAlign = function(element) {
				element.style.removeProperty('text-align');
				
				for (var $i = 0; $i < element.children.length; $i++) {
					$stripTextAlign(element.children[$i]);
				}
			};
			
			for (var $i = 0; $i < this.alignment.blocks.length; $i++) {
				var $block = this.alignment.blocks[$i];
				switch ($block.tagName) {
					case 'BLOCKQUOTE':
						$block.style.removeProperty('text-align');
						$stripTextAlign($block.children[0]);
					break;
					
					case 'DIV':
						if (/\bcodeBox\b/.test($block.className)) {
							$stripTextAlign($block);
						}
					break;
				}
			}
		}
	};
};
