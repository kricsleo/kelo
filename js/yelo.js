/**
 * request
 * @param {*} url resouce url
 * @param {*} params requst payload
 */
async function request(url, params) {
  const response = await fetch(url, params).catch((e) => {
    ok: false, e;
  });
  if (!response.ok) {
    return Promise.reject(response.e || new Error("request failed"));
  }
  return response.json();
}

/**
 * load page data
 * @param {*} page page number, start from 0
 */
async function loadPosts(page) {
  const json = await request(`/json/pagination/${page}.json`).catch(() => null);
  return json;
}

/**
 * operate className in chain
 * @param {*} node operate node
 */
function cs(node) {
  const fn = {
    add: className => {
      node.classList.add(className);
      return fn;
    },
    remove: className => {
      node.classList.remove(className);
      return fn;
    }
  }
  return fn;
}



/**
 * return a function to constantly load posts with pagination
 */
function createInfiniteLoadPosts() {
  let loading = false;
  let page = 0;
  const load = async () => {
    if (loading) {
      return;
    }
    loading = true;
    const postsInfo = await loadPosts(page);
    loading = false;
    page += 1;
    return postsInfo;
  };
  return load;
}

/**
 * using IntersectionObserver to infinite load
 * @param {*} root parent node
 * @param {*} child observer node
 * @param {*} cb trigged callback when satisfied
 * @param {*} bottomThreshold the extended bottom gap
 */
function observe(root, child, cb, bottomThreshold = 100) {
  const observer = new IntersectionObserver(cb, {
    root,
    rootMargin: `0px 0px ${bottomThreshold}px 0px`,
    threshold: 1
  });
  const start = () => observer.observe(child);
  const stop = () => observer.unobserve(child);
  const destroy = () => observer.disconnect();
  return [start, stop, destroy];
}

/**
 * create post node
 * @param {*} post post content
 */
function createPostNode(post) {
  const node = document.createElement("div");
  node.classList.add("post");
  node.innerHTML = `
    <div class="post__content" data-path="${post.path}">
      <div class="post__content__body">
        ${post.excerpt || `<h1>${post.title || '谜一样的内容'}</h1>`}
      </div>
      <button class="post__content__close VHClose">
        <svg class="kcon" aria-hidden="true">
            <use xlink:href="#kconClose"></use>
        </svg>
      </button>
    </div>
  `;
  return node;
}

/**
 * select shortest node
 * @param {*} nodes node list
 */
function selectShortestNode(nodes) {
  return nodes.reduce((curNode, finalNode) => {
    return curNode.clientHeight < finalNode.clientHeight ? curNode : finalNode;
  }, nodes[0]);
}

/**
 * select the shortest lane to insert node
 * @param {*} lanes all lane nodes
 * @param {*} node to be inserted node
 */
function insertPostNode(lanes, node) {
  const shortestNode = selectShortestNode(lanes);
  shortestNode.appendChild(node);
}

/**
 * insert post data to document
 * @param {*} post
 */
function insertPost(lanes, post) {
  const postNode = createPostNode(post);
  const shortestLane = selectShortestNode(lanes);
  shortestLane.appendChild(postNode);
}

/**
 * delegate event, support className for now
 * @param {*} parent
 * @param {*} target
 * @param {*} event
 * @param {*} cb
 */
function delegateEvent(parent, targetClassName, event, cb) {
  const handler = e => {
    let target = e.target;
    while (!e.cancelBubble && target && target !== parent) {
      if (target.classList.contains(targetClassName)) {
        cb && cb(e, target);
        return;
      } else {
        target = target.parentElement;
      }
    }
  };
  // TODO: multi handler should be called depends dom structure, not applied sequence
  parent.addEventListener(event, handler);
  return () => parent.removeEventListener(event, handler);
}

function setStyle(node, style) {
  Object.entries(style).forEach(([key, value]) => node.style[key] = value);
  return node;
}

function numberToPx(number) {
  return `${number}px`;
}

function pinNode(node) {
  const { clientHeight, clientWidth } = node;
  setStyle(node, {
    width: numberToPx(clientWidth),
    height: numberToPx(clientHeight)
  });
}

function unPinNode(node) {
  setStyle(node, {
    width: 'auto',
    height: 'auto'
  });
}

// function lockNode(node) {
//   const scrollBarWidth = node.offsetWidth - node.clientWidth;
//   setStyle(node, {
//     overflow: 'hidden',
//     paddingRight: numberToPx(scrollBarWidth)
//   });
// }

// function unlockNode(node) {
//   setStyle(node, {
//     overflow: 'auto',
//     paddingRight: 0
//   })
// }

function fullscreenNode(parent, target) {
  const { clientHeight, clientWidth } = parent;
  const { top, left, bottom, right } = target.getBoundingClientRect();
  setStyle(target, {
    position: 'absolute',
    top: numberToPx(top),
    left: numberToPx(left),
    bottom: numberToPx(clientHeight - bottom),
    right: numberToPx(clientWidth - right)
  });
  requestAnimationFrame(() => cs(target).add('post__content--fullscreen'));
}

function unfullscreenNode(node) {
  cs(node).remove('post__content--fullscreen');
  setTimeout(() => setStyle(node, {
    position: 'static',
    // top,
    // left,
    // bottom,
    // right
  }), 300);
}

function pathToUrl(postPath) {
  return postPath.replace(/\//, '_');
}

/**
 * load post detail, according to post path
 * @param {*} postPath post path
 */
async function loadPostDetail(postUrl) {
  const postJsonUrl = `/json/post/${postUrl}.json`;
  const post = await request(postJsonUrl);
  return post;
}

function createHandlePostDetail() {
  const loadedPostInfo = {};
  return {
    load: async (postPath, postPreviewContent) => {
      const postUrl = pathToUrl(postPath);
      if (loadedPostInfo[postUrl] && (loadedPostInfo[postUrl].loading || loadedPostInfo[postUrl].data.content)) {
        return;
      }
      loadedPostInfo[postUrl] = {
        loading: true,
        data: postPreviewContent
      };
      const post = await loadPostDetail(postUrl);
      loadedPostInfo[postUrl] = {
        loading: false,
        data: post
      };
    },
    get: postPath => {
      const url = pathToUrl(postPath);
      return loadedPostInfo[url] || {};
    }
  }
}

function loadingMask(node) {
  const maskNode = document.createElement('div');
  setStyle(maskNode, {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)'
  });
  cs(maskNode).add('loading-mask VHCenter');
  const loadingNode = document.createElement('div');
  setStyle(loadingNode, {
    width: numberToPx(100),
    height: numberToPx(100)
  });
  cs(loadingNode).add('loading');
  maskNode.appendChild(loadingNode);
  node.appendChild(maskNode);
}

function removeLoading(node) {
  const maskNode = node.getElementsByClassName('loading-mask')[0];
  node.removeChild(maskNode);
}


/**
 * all variables declared here
 */

// page main content node
const pageBodyNode = document.getElementById("page__body");

// observer node to unfinite load posts as if it can be observed
const postsLoaderNode = document.getElementById("posts-loader");

const postsWrapperNode = document.getElementById('posts-wrapper');

// lanes to collect post
const postsNodes = [...document.getElementsByClassName('posts')];

// init pagination
function initPagination(loadPostJson) {
  // create load posts functions
  const infiniteLoadPosts = createInfiniteLoadPosts();

  // create observer to load posts
  const [startObserve, stopObserve, destroyObserve] = observe(
    pageBodyNode,
    postsLoaderNode,
    entires => {
      const { intersectionRatio } = entires[0];
      intersectionRatio > 0 && infiniteInsertPosts();
    },
    500
  );
  startObserve();

  const startLoader = () => cs(postsLoaderNode).add('loading');
  const stopLoader = () => cs(postsLoaderNode).remove('loading').add('done');;

  //  infinite insert posts to document
  async function infiniteInsertPosts(entries) {
    startLoader();
    stopObserve();
    const postsInfo = await infiniteLoadPosts().catch(e => null);
    if (!postsInfo) {
      stopLoader();
      return;
    }
    const { result, hasMore } = postsInfo;
    result.map(post => {
      insertPost(postsNodes, post);
      loadPostJson(post.path, post);
    });
    if (hasMore) {
      startObserve();
    } else {
      stopLoader();
      destroyObserve();
    }
  }
}

function initLoadPostDetail(getPostData) {
  // cancel fullscreen
  delegateEvent(pageBodyNode, 'post__content__close', 'click', (e, closeNode) => {
    e.stopPropagation();
    const postContentNode = closeNode.parentElement;
    const postNode = postContentNode.parentElement;
    unPinNode(postNode);
    unfullscreenNode(postContentNode);
    const postContentBody = postContentNode.getElementsByClassName('post__content__body')[0];
    const { data } = getPostData(postContentNode.dataset.path);
    postContentBody.innerHTML = data.excerpt;
  });

  // enter fullscreen
  delegateEvent(pageBodyNode, 'post', 'click', (e, postNode) => {
    const postContentNode = postNode.getElementsByClassName('post__content')[0];
    const postContentBody = postNode.getElementsByClassName('post__content__body')[0];
    if (postContentNode.classList.contains('post__content--fullscreen')) {
      return;
    }
    pinNode(postNode);
    fullscreenNode(pageBodyNode, postContentNode);

    let alreadyLoading = false;
    function insertPostContent() {
      const { loading, data } = getPostData(postContentNode.dataset.path);
      if (loading) {
        setTimeout(inserPostContent, 50);
        if (alreadyLoading) {
          return;
        } else {
          alreadyLoading = true;
          loadingMask(postContentNode);
        }
      } else {
        alreadyLoading && removeLoading(postContentNode);
        postContentBody.innerHTML = data.content || 'No Content.';
      }
    }
    insertPostContent();

  });
}

// init icon
function initKcon() {
  !function(e){var t,n,o,i,a,d,l='<svg><symbol id="kconClose" viewBox="0 0 1024 1024"><path d="M1007.67938 1007.616358a56.313464 56.313464 0 0 1-79.107008 0L646.111189 725.155175l-39.553504-39.553504a55.866531 55.866531 0 0 1 0-79.107009 55.866531 55.866531 0 0 1 79.107009 0l39.553504 39.553505 282.461182 282.461182a56.313464 56.313464 0 0 1 0 79.107009z" fill="#00C569" ></path><path d="M1007.67938 16.320625a56.313464 56.313464 0 0 0-79.107008 0L512.031514 432.861483 95.490656 16.320625a56.089997 56.089997 0 0 0-79.107008 0 56.313464 56.313464 0 0 0 0 79.107008l416.540858 416.540858L16.383648 928.509349a55.866531 55.866531 0 0 0 79.107008 79.107009L1007.67938 95.427633a56.089997 56.089997 0 0 0 0-79.107008z" fill="#111111" ></path></symbol></svg>',c=(c=document.getElementsByTagName("script"))[c.length-1].getAttribute("data-injectcss");if(c&&!e.__iconfont__svg__cssinject__){e.__iconfont__svg__cssinject__=!0;try{document.write("<style>.svgfont {display: inline-block;width: 1em;height: 1em;fill: currentColor;vertical-align: -0.1em;font-size:16px;}</style>")}catch(e){console&&console.log(e)}}function s(){a||(a=!0,o())}t=function(){var e,t,n,o;(o=document.createElement("div")).innerHTML=l,l=null,(n=o.getElementsByTagName("svg")[0])&&(n.setAttribute("aria-hidden","true"),n.style.position="absolute",n.style.width=0,n.style.height=0,n.style.overflow="hidden",e=n,(t=document.body).firstChild?(o=e,(n=t.firstChild).parentNode.insertBefore(o,n)):t.appendChild(e))},document.addEventListener?~["complete","loaded","interactive"].indexOf(document.readyState)?setTimeout(t,0):(n=function(){document.removeEventListener("DOMContentLoaded",n,!1),t()},document.addEventListener("DOMContentLoaded",n,!1)):document.attachEvent&&(o=t,i=e.document,a=!1,(d=function(){try{i.documentElement.doScroll("left")}catch(e){return void setTimeout(d,50)}s()})(),i.onreadystatechange=function(){"complete"==i.readyState&&(i.onreadystatechange=null,s())})}(window);
}

// the entry funciton
function init() {
  initKcon();

  const { load: loadPostJson, get: getPostData } = createHandlePostDetail();

  initPagination(loadPostJson);

  initLoadPostDetail(getPostData);
}

init();
