event.replaceResponse(
  new Response(null, {
    status: 301,
    headers: {
      Location: "https://www.netlify.com/products/edge/",
    },
  })
);
