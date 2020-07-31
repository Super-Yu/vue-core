// 工具对象
const utils = {
  getValue(expr,data){
    return data[expr.trim()]
  },
  setValue(expr,data,newValue) {
    data[expr] = newValue;
  },
  model(node,value,data) {
    const initValue = this.getValue(value, data) // 返回绑定变量的值
    new Watcher(value,data,(newVal)=>{
      this.modelUpdater(node,newVal)
    })
    node.addEventListener('input', (e) => {
      const newVal = e.target.value;
      this.setValue(value,data,newVal)
    })
    this.modelUpdater(node,initValue)
  },
  text(node,value,data) {
    let result;
    if(value.includes('{{')) { // {{xxx}}
      // 返回绑定变量的值
      result = value.replace(/\{\{(.+)\}\}/g,(...args) => {
        const expr = args[1];
        new Watcher(expr,data,(newVal)=>{
          this.textUpdater(node,newVal)
        })
        return this.getValue(args[1],data); // args[1] 是我们匹配到的变量
      });
    } else { // v-text=XXX
      // 返回绑定变量的值
      result = this.getValue(value,data);
    }
    this.textUpdater(node,result);
  },
  on(node,value,data,eventName,vm) {
    // debugger
    const fn = vm.$options.methods[value];
    // console.dir(fn.bind(vm))
    node.addEventListener(eventName, fn.bind(vm),false)// bind改变this指向为vm  .bind()返回的是一个函数
  },
  // 当前节点的值替换
  modelUpdater(node,value){
    node.value = value;
  },
  // text内容替换
  textUpdater(node,value) {
    node.textContent = value;
  }
}

// 收集依赖 dom与数据之间更新与回调的关系
class Watcher{
  constructor(expr, data, cb) {
    this.expr = expr;
    this.data = data;
    this.cb = cb;
    this.oldValue = this.getOldValue(); // 通过getter对数据进行绑定，标记当前watcher
  }
  getOldValue() {
    Dep.target = this; // Dep.target只是为了拿一个全局变量 来做记录当前watcher
    const oldValue = utils.getValue(this.expr, this.data);
    Dep.target =null;
    return oldValue;
  }
  update() {
    const newValue = utils.getValue(this.expr,this.data);
    if(newValue !== this.oldValue){
      this.cb(newValue);
    }
  }
}

// 一个数据和多个watcher之间绑定
class Dep {
  constructor() {
    this.collect = []
    console.log('collectList',this.collect);
  }
  addWatcher(watcher) {
    this.collect.push(watcher);
  }
  notify() {
    console.log('this.collect',this.collect);
    this.collect.forEach(w=>{
      w.update();
    })
  }
}

// 将模板中使用的data部分的变量和模板绑定起来
class Compiler{
  constructor(el,data,vm) {
    this.el = this.isElementNode(el) ? el : document.querySelector(el);
    this.data = data;
    this.vm = vm;

    // 文档片段 操作Fragment过程中不会引起页面ui更新 操作完成后一次性插入到页面中去 节省性能
    let fragment = this.compileFragment(this.el)

    // 对元素进行编译的处理 把所有的内容遍历 判断是否有我们需要的{{}}和v- 和数据进行绑定
    this.compile(fragment);
    this.el.appendChild(fragment)
  }
  compile(fragment) {
    const childNodes = Array.from(fragment.childNodes); // 将类数据对象转化为数组
    childNodes.forEach(childNode=>{
      if (this.isElementNode(childNode)) { 
        // 标签节点h1、input读取属性值，查看是否有v-开头的内容
        this.compileElement(childNode);
      } else if (this.isTextNode(childNode)) {
        // 内容文本节点{{msg}} 是否有双括号
        this.compileText(childNode);
      }
      if(childNode.childNodes && childNode.childNodes.length) {
        this.compile(childNode)
      }
      // ps：换行符也会输出节点#text nodeType=3，元素nodeType=1）

    })
  }
  compileElement(node) {
    const attributes = Array.from(node.attributes);
    attributes.forEach(attr => {
      const {name,value} = attr;
      // v-model v-text v-on:click @click
      if (this.isDirector(name)) { // 判断是否v-开头
        const [,directive] = name.split('-');
        const [compileKey, eventName] = directive.split(':');
        utils[compileKey](node,value,this.data,eventName,this.vm);
      } else if(this.isEventName(name)){// @开头的情况
        const [,eventName] = name.split('@');
        utils['on'](node,value,this.data,eventName,this.vm);
      }
    })
  }
  isDirector(name) {
    return name.startsWith('v-');
  }
  isEventName(name) {
    return name.startsWith('@');
  }
  compileText(node) {
    const content = node.textContent;
    if(/\{\{(.+)\}\}/g.test(content)){ // 如果有{{XXXXX}}
      // console.log(content)
      utils['text'](node,content,this.data);
    }
  }
  compileFragment(el) {
    const f = document.createDocumentFragment();
    let firstChild;
    while (firstChild = el.firstChild) {
      f.appendChild(firstChild) //使用 appendChild() 方法移除元素到另外一个元素。
    }
    return f
  }
  isTextNode(el) {
    return el.nodeType === 3; //确定是dom选择器节点 文本节点
  }
  isElementNode(el) {
    return el.nodeType === 1; //确定是dom选择器节点 并且是element节点
  }
}
// 观察date值变化的类
class Observer {
  constructor(data) {
    this.observe(data);
  }

  observe(data) {
    if (data && typeof data === 'object') { // 如果是object 再去循环取值
      Object.keys(data).forEach(key=>{
        this.defineReactive(data, key, data[key])
      })
    }
  }

  // 劫持data里面所有值的变更 get set
  defineReactive(obj, key, value) {
    this.observe(value); // 递归调用
    const dep = new Dep(); // 有几个key 就生成了几个Dep实例
    Object.defineProperty(obj, key, {
      get() {
        const target = Dep.target;
        // debugger
        target && dep.addWatcher(target); // 添加该watcher
        return value;
      },
      set:(newVal) => { //必须要用箭头函数来确保内层和外层this指向是一直的
        if (value === newVal) return;
        this.observe(newVal);
        value = newVal;
        dep.notify(); // 通知更新对应key的wacther（因为dep生成的时候指向的是该key的dep实例）
      }
    })
  }
}

// vue类
class Vue{
  constructor(options) {
    this.$el = options.el;
    this.$data = options.data;
    this.$options = options;
    
    // 触发this.$data.xx 和模板的绑定
    new Observer(this.$data)
    // 处理模板部分 将模板中使用的data部分的变量和模板绑定起来
    new Compiler(this.$el, this.$data, this)
    // 可以通过this(vm) .XX更改this.$data.xx的结果
    this.proxyData(this.$data)
  }
  
  // 可以通过this(vm) .XX更改this.$data.xx的结果
  proxyData(data) {
    Object.keys(data).forEach(key => {
      Object.defineProperty(this, key, {
        get() {
          return data[key]
        },
        set(newVal) {
          console.log('proxyData')
          data[key] = newVal
        }
      })
    });
  }
}