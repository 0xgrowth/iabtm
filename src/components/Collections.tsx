interface CollectionsProps {
    collections: string[];
    active: string;
    onChange: (collection: string) => void;
}

export default function Collections({
    collections,
    active,
    onChange,
}: CollectionsProps) {
    return (
        <section className="border-b border-gray-100 bg-white">
            <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="mr-3 text-lg font-semibold text-gray-900">
                        Available Collections
                    </span>

                    <button
                        onClick={() => onChange("All")}
                        className={`rounded-full px-5 py-2 text-sm transition ${active === "All"
                                ? "bg-black text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                    >
                        All
                    </button>

                    {collections.map((collection) => (
                        <button
                            key={collection}
                            onClick={() => onChange(collection)}
                            className={`rounded-full px-5 py-2 text-sm transition ${active === collection
                                    ? "bg-black text-white"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                }`}
                        >
                            {collection}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}
