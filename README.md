# veronica-ui

veronica 的一个扩展，集合一些优秀的第三方库，完成前端界面开发的主要任务

## 组件

- framework
  - form validation engine
  - view engine
  - template engine
  - data store
- ui kit
  - data table
  - tree
  - tree select
  - select
  - textbox
  - numeric
  - date(time)picker
  - progress
  - combobox
  - multipe select
  - dialog(window)
  - comfirm, prompt, alert
  - tooltip
  - notification
    - deps: noty(js), jquery
  - list
  - cascade list
  - tabs
  - menu

## 第三方库



* [jquery.inputmask](http://robinherbots.github.io/jquery.inputmask/)
* bootstrap（js）
* smalot-bootstrap-datetimepicker
* jquery-placeholder
* jquery-form
* jquery-validation
* jquery-validation-unobtrusive
* jquery-validation-bootstrap-tooltip
* form2js
* table-to-json
* noty
* jstree
* kendo-ui-core

### 自定义的 kendo-ui-core

* kendo-ui-core 的 build

```
 cd src
npm install -g grunt
npm install
grunt custom:core,data,binder,listview
```
