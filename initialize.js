/**
* HELP DESK POWERPACK - SPICEWORKS PLUGIN
* Compatible with Spiceworks 7.4.00059+
* @author Josh Breiter
* @version 0.2
* @date 2015-11-24
*/

/** CONFIGURATION PANEL SETTINGS */

plugin.configure({
  settingDefinitions:[
    { name:'ticketCounts', label:'Ticket Counts:', type:'enumeration', defaultValue:'Disabled', options:['Enabled', 'Disabled'], example:'Show totals on the Help Desk ticket view menu' },
    { name:'ticketRows', label:'Ticket Rows:', type:'enumeration', defaultValue:'8', options:['4','6','8','10','12','14','16','18','20','25'], example:'Expands the ticket list to show this many tickets by default' },
    { name:'deleteBtn', label:'Delete Button:', type:'enumeration', defaultValue:'Hide on Open Tickets', options: ['Show on Open Tickets', 'Hide on Open Tickets', 'Disable Completely'] },
    { name:'showFields', label:'Quick Entry Fields:', type:'text', defaultValue:'', example:'Example: Business Unit, Software (show any custom fields)' },
    { name:'reqNew', label:'Required on New:', type:'text', defaultValue:'', example:'Example: Category, Assignee (applies to New Ticket form only)' },
    { name:'reqClose', label:'Required on Close:', type:'text', defaultValue:'', example:'Example: Category, Time Spent, Inventory Items' },
    { name:'reqOpts', label:'Required on:', type:'enumeration', defaultValue:'Close', options:['Close', 'Close, Close as Duplicate'], example:'Choose when to check for required fields' },
    { name:'timeSpent', label:'Time Spent:', type:'text', defaultValue:'', example:'Example: 5m, 10m, 4h, 1d (overrides default options)' },
    { name:'contactFields', label:'Contact Info:', type:'text', defaultValue:'', example:'Example: Title, Office Phone, Cell Phone (custom fields too!)' },
    { name:'form', label:'Default Form:', type:'enumeration', defaultValue:'Public Response', options:['Public Response', 'Internal Note', 'Purchase'], example:'Choose which form should be shown by default' },
    { name:'tidy', label:'Tidy Comments:', type:'text', defaultValue:'', example:'Remove single-line comments containing these keywords' },
    { name:'tidyH', label:'Tidy Img Height:', type:'enumeration', defaultValue:'30', options:['10', '20', '30', '40', '50', '75', '100', '150', '200', '300'], example:'Max. height of images to be removed' },
    { name:'tidyW', label:'Tidy Img Width:', type:'enumeration', defaultValue:'30', options:['10', '20', '30', '40', '50', '75', '100', '150', '200', '300'], example:'Max. width of images to be removed' }
  ]
});

/** GLOBAL VARIABLES */

var hdppErrs = 0, hdppErrFlds = "";

/** LOAD CSS STYLESHEET */

plugin.includeStyles();

/** INITIALIZE PLUGIN */

SPICEWORKS.ready(function() {

  !function($) {

    // ------------------------------------------------------------------------

    /** SHOW APP LOGO (override default icon) */

    if (location.href.indexOf('/settings/apps') !== -1) {
      $('li[data-app-name="Help Desk PowerPack"] div.app-icon img[alt="Puzzle-small"]').attr('src', plugin.contentUrl('logo.png'));
    }

    // ------------------------------------------------------------------------

    /** EVENT HANDLERS */

    $UI.app.pluginEventBus.on("app:helpdesk:ticket:new:show", function() {
      hdppReqNew();
    });

    $UI.app.pluginEventBus.on("app:helpdesk:ticket:new:add", function() {
      hdppTktCounts();
    });

    $UI.app.pluginEventBus.on("app:helpdesk:ticket:change:status", function() {
      hdppTktCounts();
    });

    $UI.app.pluginEventBus.on("app:helpdesk:ticket:header:render", function() {
      hdppTktCounts();
      hdppDelBtn();
      hdppQeFlds();
      hdppReqClose();
    });

    $UI.app.pluginEventBus.on("app:helpdesk:ticket:show", function() {
      hdppTktCounts();
      hdppTktRows();
      hdppDelBtn();
      hdppQeFlds();
      hdppReqClose();
      defComment();
      cleanupComments();
    });

    $(document).ajaxComplete(function() { hdppContactInfo(); });

    // ------------------------------------------------------------------------

    /** HELPER FUNCTIONS */

    // Extend jQuery to make a case-insensitive text selector (used to find custom fields)
    $.extend($.expr[":"], {
      "icontains": function(elem, i, match, array) {
        return $.trim((elem.textContent || elem.innerText || "").toLowerCase()) === (match[3] || "").toLowerCase();
      }
    });

    // String Utility - Capitalize first letter of each word
    var hdppCapitalize = function(str) {
      return str.replace(/\b\w+\b/g, function(word) {
        return word.substring(0,1).toUpperCase() +
          word.substring(1);
      });
    };

    // Mark form errors (ie. required fields that are empty, etc)
    var hdppErr = function(fld, fldName) {
      fld.addClass("hdppRequired").css("background", "#fce2db").css("color", "red").on("click focus", function() {
        $(this).removeClass("hdppRequired").css("background", "none").css("color", "black");
      });
      hdppErrs++;
      hdppErrFlds += "<div>" + hdppCapitalize(fldName) + "</div>";
    };

    // Display warning message to user
    var hdppErrMsg = function(e) {

      // Prevent default button action (don't save/close the ticket)
      e.preventDefault();
      e.stopImmediatePropagation();

      // Display error msg on New Ticket form
      if ($("#new-ticket-dialog").is(":visible")) {
        hdppErrFlds = hdppErrFlds.replace(/<\/div><div>/gi, ", ").replace(/<(...)>|<\/(...)>/gi, "");
        $("#new_ticket_errors").html(hdppErrs + ' required fields are empty: ' + hdppErrFlds).show();
        window.scrollTo(0, 0);
      } else {

        // Display a modal popup
        SUI.modalPopup.build({
          size:'small',
          name:'run-ad-command',
          effect:'meaningless-name-to-prevent-bounce',
          title:'Warning',
          content:hdppErrs + ' required fields contain unacceptable values:' + hdppErrFlds,
          buttons:[{name:'Close', callback:'cancel'}]
        }).show();
      }

      // Reset fields & counts
      $(".hdppRequired").removeClass(".hdppRequired");
      hdppErrs = 0;
      hdppErrFlds = "";
    };

    // ------------------------------------------------------------------------

    /** OPTION: Ticket Rows */

    var hdppTktRows = function() {
      var rows = $(".ticket-list > tr");
      var showrows = parseInt(plugin.settings.ticketRows, 10);

      // If fewer rows than the user selected, shrink viewing area
      showrows = (showrows > rows.length) ? rows.length : showrows;

      $(".ticket-table-wrapper:not(.hdpp)").addClass("hdpp").height(rows.first().height()* showrows);
    };

    // ------------------------------------------------------------------------

    /** OPTION: Ticket Counts */

    var hdppTktCounts = function() {
      if (plugin.settings.ticketCounts === "Enabled") {

        // Ticket Views
        var grps = [
          ["Open Tickets", "open"],
          ["My Tickets", "open_and_assigned_to_current_user"],
          ["Past Due Tickets", "past_due"],
          ["Recently Updated", "recent"],
          ["Unassigned Tickets", "unassigned"],
          ["Closed Tickets", "closed"],
          ["Purchase Needed", "requiring_purchase"],
          ["All Tickets", ""]
        ];

        // Show ticket counts
        $.each(grps, function() {
          var view = this[0], filter = this[1];
          if (filter !== "") { filter = "&filter=" + this[1]; }

          new Ajax.Request('/api/tickets.json?total_count=true' + filter, {
            method:'get',
            onSuccess: function(transport) {
              var total = transport.responseText.evalJSON().count;
              var title = $(".page-header > h1 .sui-dropdown > a");
              var option = $(".page-header li a");

              // Add total to menu title
              if (title.text().replace(/\s\([0-9]+\)/gi, '') === view) {
                title.html(title.text().replace(/\s\(.+/gi, '') + ' (' + total + ')<b class="caret" />');
              }

              // Add total to menu option
              $.each(option, function() {
                if ($(this).text().replace(/\s\([0-9]+\)/gi, '') === view) {
                  $(this).text(view + " (" + total + ")");
                }
              });
            }
          });
        });
      }
    };

    // ------------------------------------------------------------------------

    /** OPTION: Show or Disable Delete Button */

    var hdppDelBtn = function() {

      // Show Delete Button
      if (plugin.settings.deleteBtn.search('Show') > -1) {

        // Kudos to Chandler N (Spiceworks) for this solution
        var deletebtn = $('.delete-button-wrapper');
        if (deletebtn.css('display') === 'none') {
          deletebtn.css('display', 'inline-block').on('click', function() {
            var ticketID = $('.ticket-id').text().replace('#', '');
            var thisView = Backbone.Relational.store.find($UI.app.HelpDesk.Common.Models.Ticket, ticketID);
            thisView.save('muted', 'true');
            thisView.save('status', 'closed', {
              success: function () {
                $('.ticket-delete-button').trigger('click');
              }
            });
          });
        }
      }

      // Disable Delete Button
      else if (plugin.settings.deleteBtn.search('Disable') > -1) {
        $('.delete-button-wrapper').hide();
      }
    };

    // ------------------------------------------------------------------------

    /** OPTION: Quick Entry Fields */

    var hdppQeFlds = function() {
      if (plugin.settings.showFields !== "") {

        if ($(".hdppQEntry").length) { return; }

        var row;
        var n = 0;

        // Cycle through each field
        $.each(plugin.settings.showFields.split(','), function() {

          // Add new row to Quick Entry toolbar
          if (n % 6 === 0) {
            row = $('<div class="hdppQEntry sui-row-fluid" />').appendTo('.ticket-ribbon > div');
          }

          // Show custom fields
          var fld = $.trim(this);
          var f = $("#ticket_pane dl.custom dt:icontains('" + fld + "')");
          if (f) {
            f.next("dd").appendTo($('<div class="span2"><h4>' + fld + '</h4></div>').appendTo(row));
            f.remove();
            n++;
          }
        });
      }
    };

    // ------------------------------------------------------------------------

    /** OPTION: Required on New */

    var hdppReqNew = function() {
      if (plugin.settings.reqNew !== "") {

        var form = $("#new-ticket-dialog"), fld;

        // When Save button is clicked...
        form.find("button[data-button-type='submit']").on("mousedown keydown", function(e) {
          var reqFlds = plugin.settings.reqNew;

          // Cycle through each required field
          $.each(reqFlds.toLowerCase().split(","), function() {
            var rf = $.trim(this);

            // Get field label
            var lbl = form.find("label:icontains('" + rf + "')");
            if (lbl.length) {

              // Handle special fields
              if ($.inArray(rf, ["related to", "cc users"]) !== -1) {
                fld = lbl.next().find(".select2-choices");
                if (fld.find(".select2-search-choice").length < 1) {
                  hdppErr(fld, rf);
                } else {
                  fld.trigger("focus");
                }
              }

              // Regular fields
              else {
                fld = lbl.next().find(":input:visible:first");
                if ($.trim(fld.val()) === "") {
                  hdppErr(fld, rf);
                }
              }
            }
          });

          // Notify user
          if (hdppErrs > 0) {
            hdppErrMsg(e);
            return false;
          }
        });
      }
    };

    // ------------------------------------------------------------------------

    /** OPTION: Required on Close */

    var hdppReqClose = function() {
      if (plugin.settings.reqClose !== "") {

        var form = $("#ticket_pane");

        // Check on Close and also on Close as Duplicate
        var buttons = ".ticket-close-button,.close-with-comment,.comment-action label.checkbox";
        if (plugin.settings.reqOpts === "Close, Close as Duplicate") {
          buttons += ",.ticket-dup-button";
        }

        // Event trigger
        $(buttons).on("mousedown keydown", function(e) {
          var reqFlds = plugin.settings.reqClose;

          // Cycle through all required fields
          $.each(reqFlds.toLowerCase().split(','), function() {
            var rf = $.trim(this), rvalues = "", acceptable = false;

            // Parse user-specified required values for required fields
            if (rf.indexOf(':') > 0) {
              rvalues = rf.split(':')[1].toLowerCase();
              rf = rf.split(':')[0];
              rvalues = (rvalues.indexOf('|') > 0) ? rvalues.split('|') : [ rvalues ];
            }

            // Special field - Related To/Inventory Items
            if (rf === "related to" || rf === "inventory items") {
              if ($(".related .related-items .empty").length === 1) {
                hdppErr($(".inventory-items .select2-choices"), rf);
              } else {
                $(".inventory-items .select2-choices").trigger("focus");
              }
            } else {

              // Get field label
              var lbl = form.find(".ticket-ribbon h4:icontains('" + rf + "'),.additional-details dt:icontains('" + rf + "')");
              if (lbl.length === 1) {
                var fld = lbl.next().find('div.body,.date-due,.date-val,.current-selection,.editable-field .activator');

                // Check for user-specified required values
                if (rvalues !== "") {
                  $.each(rvalues, function() {
                    var f = fld.filter(':icontains("' + this + '")');
                    if (f.length === 1) {
                      acceptable = true;
                    }
                  });

                  // Mark field with error
                  if (!acceptable) {
                    hdppErr(fld, rf);
                    return;
                  }
                }

                // Check for empty values
                if (!acceptable) {
                  $.each(["unassigned", "unspecified", "0m", "null", "$null", "none"], function() {
                    var f = fld.filter(':icontains("' + this + '")');

                    // Mark field with error
                    if (f.length === 1) {
                      hdppErr(f, rf);
                    }
                  });
                }
              }
            }
          });

          // Notify user
          if (hdppErrs > 0) {

            // Show Details tab if there are required fields on it
            if ($('#ticket_pane .details .hdppRequired').length > 0) {
              $('#ticket_pane .nav-tabs a:eq(1)').tab('show');
            } else if ($('#ticket_pane .related .hdppRequired').length > 0) {
              $('#ticket_pane .nav-tabs a:eq(2)').tab('show');
            }

            hdppErrMsg(e);
            return false;
          }
        });
      }
    };

    // ------------------------------------------------------------------------

    /** OPTION: Time Spent */

    // Convert a friendly time (ie. 10m, 1h, 3d) into a real time value (in minutes)
    var hdppTime = function(val) {
      var unit;
      if (val.search(' ') > 0) {
        // Handle complex times (ie. "1d 30m")
        return hdppTime(val.split(' ')[0]) + hdppTime(val.split(' ')[1]);
      } else {
        // Handle simple times (ie. "45m")
        unit = val.slice(-1);
        val = parseInt(val.replace(unit, ""), 10);
      }

      // Convert hours and days to minutes
      if (unit === "h") { val = val * 60; }
      if (unit === "d") { val = val * 60 * 8; }
      return val;
    };

    // Override time spent options with a custom selection
    var hdppShowTime = function() {
      var opts = plugin.settings.timeSpent.toLowerCase().split(',');
      var n = 0;
      var li = $('.labor-popover:visible li[data-add-time]');

      // Cycle through each custom time spent option
      $.each(opts, function() {

        // Only allow 4 options max.
        if (n > 3) { return; }

        var val = 0, opt = $.trim(this);

        // Get the real value in minutes
        val = hdppTime(opt);

        // Update options
        $(li[n]).attr("data-add-time", val).text("+" + opt);
        n++;
      });
    };

    // Enable custom list of options for Time Spent dropdown
    if (plugin.settings.timeSpent !== "") {

      $("body").on("mouseup hdppTime", ".labor-clickover, .time-spent-dropdown .pencil", function() {

        // Give the popup time to show before modifying options
          setTimeout(function() {
            if ($(".labor-popover").length > 0) { hdppShowTime(); }
            else { $(".time-spent-dropdown .pencil").trigger("hdppTime"); }
          }, 5);
      });
    }

    // ------------------------------------------------------------------------

    /** OPTION: Contact Info */

    var hdppContactInfo = function() {

      if (plugin.settings.contactFields !== "") {

        fields = plugin.settings.contactFields.split(',');

        $("div.user-card p.additional:not(.hdpp)").addClass("hdpp").each(function() {

          var card = $(this);
          var data = card.closest(".user-info").data("hdpp");

          // Use cached data to avoid round-trip to the server
          if (data) {
            card.html(data[0]).closest(".card").height(data[1]);
          }

          // Retrieve data from People module
          else {
            var userid = card.parent().find(".title").attr("data-id");

            SPICEWORKS.data.query({ 'udata': { 'class': 'User', 'conditions': 'id="' + userid + '"' }}, function(results) {
              data = results.udata[0];
              var details = "";
              var n = 0;

              // Show requested contact details
              $.each(fields, function(i, fld) {
                fld = fld.strip().toLowerCase().replace(/ /gi, "_");
                var val = data[fld];

                // Handle custom attributes
                if (!val && data["c_" + fld] !== undefined) { val = data["c_" + fld]; }

                if (val) {
                  details += '<span title="' + fields[i].strip() + '">' + val + '</span>';
                  n++;
                }
              });

              // Populate contact details and adjust card height
              var h = 88 + ((n - 2) * 12);
              card.html(details).closest(".card").height(h).closest(".user-info").data("hdpp", [ details, h ]);
            });
          }
        });
      }
    };

    // ------------------------------------------------------------------------

    /** OPTION: Default Comment Form */

    var defComment = function() {
      $(".activity-contents .actions > li:contains('" + plugin.settings.form + "')").click();
    };

    // ------------------------------------------------------------------------

    /** OPTION: Tidy Comments */

    var cleanupComments = function() {

      var cmts = $('.ticket-pane-content .comments p.body');
      var keywords = plugin.settings.tidy.toLowerCase().split(',');

      // Cycle through each comment
      $.each(cmts, function() {
        var cmt = $(this), data = '';

        // Remove small image attachments
        var att = cmt.find('a.dl-link');
        if (att.length) {
          var ext = att.text().substr(att.text().lastIndexOf('.') + 1);

          if ($.inArray(ext, ['jpg', 'gif', 'png', 'bmp']) !== -1) {
            var div = $('<div style="display:none"></div>').appendTo(cmt.closest('.activity-item'));
            $('<img />').appendTo(div).attr('src', att.attr('href')).on('load', function() {
              if (this.width <= Number(plugin.settings.tidyW) && this.height <= Number(plugin.settings.tidyH)) {
                $(this).closest('li.activity-event').hide();
              }
              $(this).remove(); // Cleanup temp img
            });
          }
        } else if (keywords[0] !== '') {

          // Tidy up single-line comments
          var line = cmt.html().toString().toLowerCase();
          if ((line.match(/<br/gi) || []).length === 1) {
            $.each(keywords, function() {
              var kw = $.trim(this);
              if (line.indexOf(kw) !== -1) {
                cmt.closest('li.activity-event').hide();
              }
            });
          }
        }
      });
    };

    // ------------------------------------------------------------------------

  }(jQuery);
});​
