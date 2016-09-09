define([
    'qtip2'
], function(){

    // modal confirm

    var TPL_CONFIRM = '<div class="modal fade v-modal-confirm" id="v-modal-confirm" tabindex="-1">' +
        '    <div class="modal-dialog modal-sm" role="document">' +
        '        <div class="modal-content v-confirm-content">' +
        '            <div class="modal-body v-confirm-body">' +
        '                <span class="glyphicon glyphicon-question-sign v-confirm-icon"></span>' +
        '                <span class="v-confirm-msg"></span>' +
        '            </div>' +
        '            <div class="modal-footer v-confirm-footer">' +
        '                <button type="button" class="btn btn-default btn-sm" data-dismiss="modal">取 消</button>' +
        '                <button type="button" class="btn btn-primary btn-sm js-ok" data-dismiss="modal">确 认</button>' +
        '            </div>' +
        '        </div>' +
        '    </div>' +
        '</div>';


    var COMFIRM_KEY = '#v-modal-confirm';
    var NS = '.v-modal-confirm';

    $.modalConfirm = function (msg) {
        var deferred = $.Deferred();
        var $m = $(COMFIRM_KEY);
        if ($m.length === 0) {
            $(TPL_CONFIRM).appendTo($('body'));
        }
        $m = $(COMFIRM_KEY);
        var data = $m.data('bs.modal');
        if(data != null){
            $m.off(NS);
        }
        // bind events
        var rt = false;
        $m.on('click' + NS, '.js-ok', function (e) {
            rt = true;
        })
        $m.on('hidden.bs.modal' + NS, function (e) {
            if (rt === true) {
                deferred.resolve();
            } else {
                deferred.reject();
            }
        })

        if (msg != null) {
            $m.find('.v-confirm-msg').html(msg);
        }

        $m.modal();

        return deferred.promise();
    }

    // popover Confirm

   // $.popoverConfirm =
})
