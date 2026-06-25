"use client";

import { useTheme } from "../app/ThemeContext";

interface InstagramPost {
  id: string;
  imageUrl: string;
  likes: number;
  comments: number;
  caption: string;
}

const INSTAGRAM_POSTS_MOCK: InstagramPost[] = [
  {
    id: "post-1",
    imageUrl: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=600&q=80",
    likes: 342,
    comments: 28,
    caption: "Porsche 911 Carrera S disponível no pátio. Detalhes de curadoria exclusiva e laudo cautelar 100% aprovado. Agende sua visita! 🏁🔥 #porsche #porsche911 #premium"
  },
  {
    id: "post-2",
    imageUrl: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=600&q=80",
    likes: 219,
    comments: 14,
    caption: "Land Rover Defender 110. A combinação perfeita entre força, luxo e capacidade off-road. Único dono e histórico completo. 🏔️✨ #landrover #defender110 #offroad"
  },
  {
    id: "post-3",
    imageUrl: "https://images.unsplash.com/photo-1552215695-3004980ad54e?auto=format&fit=crop&w=600&q=80",
    likes: 456,
    comments: 42,
    caption: "BMW X5 M Sport Híbrida. Tecnologia embarcada, performance de linhagem esportiva e eficiência urbana impecável. Venha conhecer nosso showroom. 🔋⚡ #bmw #bmwx5 #hybrid"
  },
  {
    id: "post-4",
    imageUrl: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80",
    likes: 188,
    comments: 9,
    caption: "Toyota Hilux SRX 2023. Robustez indestrutível com conforto e tecnologia para o seu dia a dia ou final de semana no campo. 4x4 ativo. 🚜🌾 #toyota #hilux #4x4"
  }
];

export default function InstagramFeed() {
  const { companySettings } = useTheme();
  const username = companySettings?.instagramUsername || "motorsstore.oficial";
  const instagramUrl = `https://instagram.com/${username}`;

  return (
    <section className="w-full bg-brand-card/30 border border-brand-card-border rounded-3xl p-6 md:p-8 flex flex-col gap-6 animate-fadeIn">
      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-brand-card-border/50">
        <div className="flex items-center gap-4">
          {/* Avatar simulation */}
          <div className="h-14 w-14 rounded-full bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] p-[2.5px] flex items-center justify-center shadow-md">
            <div className="h-full w-full rounded-full bg-zinc-950 flex items-center justify-center text-white text-xs font-black border-2 border-zinc-950">
              MS
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-brand-text leading-none font-mono">
                {username}
              </span>
              {/* Verified badge */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-500">
                <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 4.554 4.554c.95 1.803.95 3.996 0 5.799a4.49 4.49 0 0 1-4.554 4.554c-.824.95-2.04 1.549-3.397 1.549a4.49 4.49 0 0 1-3.397-1.549a4.49 4.49 0 0 1-4.554-4.554c-.95-1.803-.95-3.996 0-5.799a4.49 4.49 0 0 1 4.554-4.554ZM16.03 10.03a.75.75 0 0 0-1.06-1.06L11 12.94L9.53 11.47a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l4-4Z" clipRule="evenodd" />
              </svg>
            </div>
            
            {/* Stats */}
            <div className="flex items-center gap-4 mt-2 text-[10px] text-brand-text/50 font-medium">
              <span><strong>40</strong> publicações</span>
              <span><strong>8.4K</strong> seguidores</span>
              <span><strong>231</strong> seguindo</span>
            </div>
          </div>
        </div>

        {/* Follow Button */}
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start sm:self-center bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
          </svg>
          Seguir no Instagram
        </a>
      </div>

      {/* Grid of Posts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {INSTAGRAM_POSTS_MOCK.map((post) => (
          <a
            key={post.id}
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-square bg-zinc-950 overflow-hidden border border-brand-card-border/50 rounded-2xl hover:border-brand-primary/30 transition-all duration-300 shadow-sm"
          >
            {/* Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.imageUrl}
              alt={post.caption}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out brightness-[0.95] group-hover:brightness-[0.6]"
              loading="lazy"
            />

            {/* Hover overlay with likes / comments */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-10 bg-black/40 backdrop-blur-[2px]">
              <div className="flex items-center gap-5 text-white">
                {/* Likes */}
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-500">
                    <path d="m11.645 20.91l-.007-.003l-.022-.012a15.247 15.247 0 0 1-.383-.218a25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25C2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052A5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25c0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17a15.247 15.247 0 0 1-.383.219l-.022.012l-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
                  </svg>
                  {post.likes}
                </div>

                {/* Comments */}
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                    <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383L12 21.75l-3.676-4.637c-1.205-.125-2.366-.254-3.476-.383a4.922 4.922 0 0 1-3.348-3.97V6.74c0-1.946 1.37-3.678 3.348-3.97ZM6.75 8.25a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5h-6Z" clipRule="evenodd" />
                  </svg>
                  {post.comments}
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
