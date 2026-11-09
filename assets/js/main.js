// Refresh requirements to clear and reload
document.addEventListener('DOMContentLoaded', function () {

    // Get a reference to the SVG and its height/width
    var geoJsonSvg = d3.select("#geojson-map");
    var geoJsonWidth = geoJsonSvg.node().clientWidth;
    var geoJsonHeight = geoJsonSvg.node().clientHeight;

    // A variable to store the world-geojson and country-coordinates data
    var worldData;
    var countryData;

    var colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    var radiusScale = d3.scaleSqrt().range([2, 15]);

    const projection = d3.geoPatterson();

    var tooltip = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0);
    function tipMouseover(event, d) {
        this.classList.add("circle-hover");
        tooltip.interrupt().style("opacity", 1).text("");
        tooltip.append("strong").style("text-transform", "capitalize").text(d.name);
        tooltip.append("div").style("color", colorScale(d.type)).text(d.type);
        tooltip.append("div").text(d.lived_in + " · " + d.period_year + " million years ago");
        tipMousemove(event);
    }
    function tipMousemove(event) {
        var box = tooltip.node().getBoundingClientRect();
        tooltip.style("left", Math.max(8, Math.min(event.clientX + 16, window.innerWidth - box.width - 12)) + "px")
            .style("top", Math.max(8, Math.min(event.clientY + 16, window.innerHeight - box.height - 12)) + "px");
    }
    function tipMouseout() {
        this.classList.remove("circle-hover");
        tooltip.style("opacity", 0);
    }
    var timelineScale, timelineBrush, brushGroup;
    var selectedYears = null;
    document.getElementById("reset").addEventListener("click", function () {
        if (brushGroup) brushGroup.call(timelineBrush.move, null);
    });
    document.getElementById("presentation").addEventListener("click", function () {
        var focused = document.body.classList.toggle("focused");
        this.setAttribute("aria-pressed", focused);
        this.textContent = focused ? "Exit focus view ↙" : "Focus view ↗";
        resize();
    });
    function resize() {
        if (!worldData) return;
        geoJsonWidth = geoJsonSvg.node().clientWidth;
        geoJsonHeight = geoJsonSvg.node().clientHeight;
        d3.select("#timeline-container").selectAll("svg").remove();
        updateMap();
    }
    var resizeTimer;
    window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });
    // Loading two files here using Promise, and waiting until both files 
    // are loaded before executing the anonymous function.
    Promise.all([Promise.resolve(window.ATLAS_WORLD), Promise.resolve(d3.csvParse(window.ATLAS_CSV))]).then(data => {
        worldData = data[0];
        countryData = data[1];

        // once the data is loaded, draw the map
        updateMap();
    }).catch(function (error) {
        document.getElementById("load-error").hidden = false;
        document.getElementById("record-count").textContent = "Visualization unavailable";
        console.error(error);
    });

    /* Draw or update the map based on the worldData object
        and the current projection
    */
    function updateMap() {

        // Responsive design based on the width and height of the svg
        projection
            .fitSize([geoJsonWidth - 75, geoJsonHeight - 75], worldData)
            .translate([geoJsonWidth / 2, geoJsonHeight / 2]);

        // this is similar to a d3.line() generator, except now we are drawing
        // the outline of each geojson shape according to the given map projection
        const geoPath = d3.geoPath().projection(projection);

        // We'll use joins to either
        //  1. Add countries if they haven't yet been added
        //  2. Transition the countries' shapes based on a new projection
        geoJsonSvg.selectAll('.country')
            .data(worldData.features)
            .join(
                enter => {
                    enter.append('path')
                        .classed('country', true)
                        .attr('vector-effect', 'non-scaling-stroke')
                        .attr('d', geoPath);
                },
                update => {
                    update.call(update => update.transition()
                        .duration(500)
                        .attr('d', geoPath));
                }
            );

        // Add graticules
        let graticule = d3.geoGraticule();
        geoJsonSvg.selectAll('.graticule')
            .data(graticule.lines())
            .join(
                enter => {
                    enter.append('path')
                        .classed('graticule', true)
                        .attr('vector-effect', 'non-scaling-stroke')
                        .attr('d', geoPath);
                },
                update => {
                    update.call(update => update.transition()
                        .duration(500)
                        .attr('d', geoPath));
                }
            );

        // Adding border graticule
        geoJsonSvg.selectAll('.boundary').remove();
        geoJsonSvg.append('path')
            .datum(graticule.outline)
            .attr("class", "boundary")
            .attr('vector-effect', 'non-scaling-stroke')
            .style('opacity', 0)
            .attr('d', geoPath)
            .transition()
            .delay(500)
            .style('opacity', 1);

        // Timeline data
        var dataForTimeline = [], dateToCount = {};

        countryData.forEach(function(d, idx) {

            d.period_year = +d.period_year;
            d.TOT = 1;
            d.latitude = +d.latitude;
            d.longitude = +d.longitude;
            colorScale(d.type);

            if (!dateToCount[d.period_year]) {
                dateToCount[d.period_year] = d.TOT;
            } else {
                dateToCount[d.period_year] += d.TOT;
            }
            
        });
        Object.keys(dateToCount).forEach(function(time) {
            dataForTimeline.push({ TIME: Number(time), TOT: dateToCount[time] });
        });

        radiusScale.domain(d3.extent(countryData, function(num) { return +num.TOT; }));

        makeTimeline(countryData, dataForTimeline);
        makeLegend();
    }

    // Creates the event timeline and sets up callbacks for brush changes
    function makeTimeline(countryData, dataForTimeline) {
        var margin = { top: 10, right: 10, bottom: 20, left: 25 },
            width = document.getElementById("timeline-container").clientWidth - 44 - margin.left - margin.right,
            height = 145 - margin.top - margin.bottom;

        var timelineSvg = d3.select("#timeline-container").append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

        var timeline = timelineSvg.append("g")
            .attr("class", "timeline")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        var x = d3.scaleLinear()
            .domain(d3.extent(dataForTimeline.map(function(d) { return d.TIME; })))
            .range([0, width]);

        var y = d3.scaleLinear()
            .domain(d3.extent(dataForTimeline.map(function(d) { return d.TOT; })))
            .range([height, 0]);
        
        var xAxis = d3.axisBottom(x);
        var yAxis = d3.axisLeft(y).ticks(10);

        var area = d3.area()
            .x(function(d) { return x(d.TIME); })
            .y0(height)
            .y1(function(d) { return y(d.TOT); })
            .curve(d3.curveBasis);

        timeline.append("path")
            .datum(dataForTimeline)
            .attr("class", "area")
            .attr("d", area);

        timeline.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")")
            .call(xAxis);

        timeline.append("g")
            .attr("class", "y axis")
            .call(yAxis);

        var brush = d3.brushX()
                        .extent([[0, 0],[width, height]])
                        .on("brush end", brushed);
        
        timelineScale = x;
        timelineBrush = brush;
        brushGroup = timeline.append("g").attr("class", "brush").call(brush);
        brushGroup.call(brush.move, selectedYears ? selectedYears.map(x) : null);
        
    };

    function brushed(event) {
        var sel = event.selection;
        selectedYears = sel ? sel.map(timelineScale.invert) : null;
        var filteredData = selectedYears ? countryData.filter(function (d) {
            return d.period_year >= Math.ceil(selectedYears[0]) && d.period_year <= Math.ceil(selectedYears[1]);
        }) : countryData;
        document.getElementById("selected-range").textContent = selectedYears
            ? Math.ceil(selectedYears[0]) + "–" + Math.ceil(selectedYears[1]) + " million years ago"
            : "All time periods";
        document.getElementById("record-count").textContent = filteredData.length + " of " + countryData.length + " records shown";
        updateMapPoints(filteredData);
    }

    // Updates the points displayed on the map, to those in the passed data array
    function updateMapPoints(data) {
        var circles = geoJsonSvg.selectAll("circle").data(data, function(d) { return d.name; });

        circles.interrupt();
        circles // update existing points
            .on("mouseover", tipMouseover)
            .on("mousemove", tipMousemove)
            .on("mouseout", tipMouseout)
            .attr("fill", function(d) { return colorScale(d.type); })
            .attr("cx", function(d) { return projection([+d.longitude, +d.latitude])[0]; })
            .attr("cy", function(d) { return projection([+d.longitude, +d.latitude])[1]; })
            .attr("r",  function(d) { return radiusScale(1); });

        circles.enter().append("circle") // new entering points
            .on("mouseover", tipMouseover)
            .on("mousemove", tipMousemove)
            .on("mouseout", tipMouseout)
            .attr("fill", function(d) { return colorScale(d.type); })
            .attr("cx", function(d) { return projection([+d.longitude, +d.latitude])[0]; })
            .attr("cy", function(d) { return projection([+d.longitude, +d.latitude])[1]; })
            .attr("r",  0)
            .transition()
            .duration(500)
            .attr("r",  function(d) { return radiusScale(1); });

        circles.exit() // exiting points
            .attr("r",  function(d) { return radiusScale(1); })
            .transition()
            .duration(500)
            .attr("r", 0).remove();
    };

    // Show the same group-to-color mapping outside the map.
    function makeLegend() {
        var items = d3.select("#legend").selectAll(".legend-item").data(colorScale.domain()).join("div").attr("class", "legend-item");
        items.selectAll("*").remove();
        items.append("span").attr("class", "swatch").style("background", colorScale);
        items.append("span").text(function (d) { return d.toLowerCase(); });
    }
});
