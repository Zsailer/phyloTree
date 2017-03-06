//function in here go from node.n -> node.layout
import d3 from "d3";
import {postOrderIteration} from "./treeHelpers";

/**
 * assign each node a rank depending on where in the tree layout its sits.
 * @param  {array} nodes the nested tree structure
 * @return {null}        chances happen in place
 */
const calculateNodeRank = function(nodes){
  let rank = 0;
  const assignNodeOrder = function(node){
    if (node.terminal){
      rank++;
      node.layout.rank = rank
      node.layout.maxRank = rank;
      node.layout.minRank = rank;
    }else{
      node.layout.rank = d3.mean(node.children.map(function(d){return d.layout.rank;}));
      node.layout.maxRank = node.children[node.children.length-1].layout.rank;
      node.layout.minRank = node.children[0].layout.rank;
    }
  }
  postOrderIteration(nodes[0], assignNodeOrder);
}

/*
 * adds the total number of descendant leaves to each node in the tree
 * the functions works recursively.
 * @>=:
 *   node -- root node of the tree.
 */
const addLeafCount = function(nodes) {
    const callback = function(node){
      if (node.terminal) {
          node.stats.leafCount = 1;
      }else{
          node.stats.leafCount = d3.sum(node.children.map(function(d){return d.stats.leafCount;}));
      }
    }
    postOrderIteration(nodes[0], callback);
};


/*
 * set the property that is used as distance along branches
 * this is set to "depth" of each node. depth is later used to
 * calculate coordinates. Parent depth is assigned as well.
 */
const setDistance = function(tree) {
  let dis = "div";
  if (tree.distance) {
    dis = tree.distance; // default is "div" for divergence
  }
  // assign node and parent depth
  tree.nodes.forEach(function(d) {
    const layout = {};
    layout.depth = d.n.attr[dis];
    layout.pDepth = d.n.parent.attr[dis];
    if (d.n.attr[dis+"_confidence"]){
      layout.conf = d.n.attr[dis+"_confidence"];
    }else{
      layout.conf = [d.layout.depth, d.layout.depth];
    }
    d.layout = layout;
  });
};



/**
 * calculates corrdiantes for the rectangular treeLayou
 * @param  {object} tree object containing the nodes and distance measure
 * @return {[type]}        [description]
 */
const rectangularLayout = function(tree) {
  const dis = tree.distance;
  tree.nodes.forEach(function(d) {
    d.layout.y = d.layout.rank; // precomputed y-values
    d.layout.x = d.layout.depth
    d.layout.px = d.layout.pDepth;  // parent positions
    d.layout.py = d.layout.y;
    if (!d.terminal){
      d.layout.yTBarStart = d.layout.minRank;
      d.layout.xTBarStart = d.layout.depth;
      d.layout.yTBarEnd = d.layout.maxRank;
      d.layout.xTBarEnd = d.layout.depth;
    }
  });
};


/**
 * calculates and assigns x,y coordinates for the radial layout.
 * in addition to x,y, this calculates the end-points of the radial
 * arcs and whether that arc is more than pi or not
 * @return {null}
 */
const radialLayout = function(tree) {
  const nTips = tree.nodes[0].stats.leafCount;
  const offset = tree.nodes[0].layout.depth;
  let circleFraction = 0.95;
  if (tree.circleFraction){
    circleFraction = tree.circleFraction;
  }
  tree.nodes.forEach(function(d) {
    d.layout.angle = 2.0 * 0.95 * Math.PI * d.layout.rank / nTips;
    d.layout.y = (d.layout.depth - offset) * Math.cos(d.layout.angle);
    d.layout.x = (d.layout.depth - offset) * Math.sin(d.layout.angle);
    d.layout.py = d.layout.y * (d.layout.pDepth - offset) / (d.layout.depth - offset + 1e-15);
    d.layout.px = d.layout.x * (d.layout.pDepth - offset) / (d.layout.depth - offset + 1e-15);
    if (!d.terminal){
        const angleCBar1 = 2.0 * circleFraction * Math.PI * d.minRank / nTips;
        const angleCBar2 = 2.0 * circleFraction * Math.PI * d.maxRank / nTips;
        d.layout.yTBarStart = (d.layout.depth - offset) * Math.cos(angleCBar1);
        d.layout.xTBarStart = (d.layout.depth - offset) * Math.sin(angleCBar1);
        d.layout.yTBarEnd = (d.layout.depth - offset) * Math.cos(angleCBar2);
        d.layout.xTBarEnd = (d.layout.depth - offset) * Math.sin(angleCBar2);
        d.layout.smallBigArc = Math.abs(angleCBar2 - angleCBar1) > Math.PI * 1.0;
    }
  });
};

/**
 * calculates x,y coordinates for the unrooted layout. this is
 * done recursively via a the function unrootedPlaceSubtree
 * @return {null}
 */
const unrootedLayout = function(tree){
  const nTips=tree.nodes[0].stats.leafCount;
  //calculate branch length from depth
  tree.nodes.forEach(function(d){d.layout.branchLength = d.layout.depth - d.layout.pDepth;});

  // do preorder iteration for find locations for all subtrees
  const placeSubtree = function(node){
    node.px = node.parent.layout.x;
    node.px = node.parent.layout.y;
    node.x = node.px+node.layout.branchLength*Math.cos(node.layout.tau + node.layout.w*0.5);
    node.y = node.py+node.layout.branchLength*Math.sin(node.layout.tau + node.layout.w*0.5);
    var eta = node.tau; //eta is the cumulative angle for the wedges in the layout
    if (!node.terminal){
        for (var i=0; i<node.children.length; i++){
            var ch = node.children[i];
            ch.w = 2*Math.PI*ch.leafCount/nTips;
            ch.tau = eta;
            eta += ch.w;
            ch.px = node.x;
            ch.py = node.y;
            unrootedPlaceSubtree(ch);
        }
    }
  };

  // set values for the root
  tree.nodes[0].x = 0;
  tree.nodes[0].y = 0;
  tree.nodes[0].tau = 1.5*Math.PI;
  placeSubtree(tree.nodes[0]);
};


/**
 * wrapper function that calls the different specific layouts
 * @param  {object} tree object containing nodes, layout, and distance, the latter two are optional
 * @return {null}       everything is changed in place.
 */
const treeLayout = function(tree){
    //determine x and y locations of nodes in abstract space
    setDistance(tree);
    calculateNodeRank(tree.nodes);
    addLeafCount(tree.nodes);

    // depending on the chosen layout, determine the location in tree scaled 2d
    if (tree.layout === "radial"){
        radialLayout(tree);
    }else if (tree.layout === "unrooted"){
        unrootedLayout(tree);
    }else if (tree.layout === "clock"){
        clockLayout(tree);
    }else{
        rectangularLayout(tree);
    }
}


export  default treeLayout;